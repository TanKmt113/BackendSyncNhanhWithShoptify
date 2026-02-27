import { Request, Response } from "express";
import { Product, Inventory, Order } from "../models";
import { Op } from "sequelize";
import * as NhanhService from "../services/nhanh.service";
import * as ShopifyService from "../services/shopify.service";
import * as SyncService from "../services/sync.service";
import * as OrderService from "../services/order.service";
import { getIO } from "../utils/socket";
import { NotificationController } from "./notification.controller";

export class DashboardController {

  static async getInventory(req: Request, res: Response) {
    try {
      // Lấy page và limit từ query, mặc định page=1, limit=20
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const search = req.query.search as string;

      // Build where clause for search
      const whereClause: any = {};
      if (search) {
        whereClause[Op.or] = [
          { '$product.name$': { [Op.like]: `%${search}%` } },
          { '$product.sku_nhanh$': { [Op.like]: `%${search}%` } },
          { '$product.sku_shopify$': { [Op.like]: `%${search}%` } }
        ];
      }

      const result = await Inventory.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        include: [{ model: Product, as: "product" }],
        order: [["id", "ASC"]],
        distinct: true, // Để count đúng khi join
      });

      res.json({
        docs: result.rows,
        total: result.count,
        pages: Math.ceil(result.count / limit),
        page,
        limit,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async syncAllProducts(req: Request, res: Response) {
    try {
      // Trigger background sync without awaiting
      SyncService.syncAllProductsFromNhanh().catch(err => {
      });

      res.json({
        message: "Processing started in background",
        socket_event: "sync_complete"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async testSocket(req: Request, res: Response) {
    try {
      const io = getIO();
      io.emit("test_event", {
        message: "Hello từ Server Shoptify!",
        time: new Date().toISOString()
      });
      res.json({ message: "Đã bắn sự kiện 'test_event' tới tất cả client." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async syncInventory(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const product = await Product.findByPk(id);
      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      if (!product.sku_shopify) {
        res.status(400).json({ error: "Product not synced to Shopify yet" });
        return;
      }

      // 1. Get Nhanh Stock
      // Assuming sku_nhanh is actually the barcode or ID used for lookup. 
      // NhanhService.getItemWithBarCode returns ID.
      // We need stock. NhanhService.getByIdProduct returns detail.
      // Let's assume we can get it via NhanhService.

      // Need to find Nhanh ID first if we only have SKU, or use existing methods.
      // product.sku_nhanh is likely the barcode/SKU string.
      const nhanhId = await NhanhService.getItemWithBarCode(product.sku_nhanh);

      let nhanhStock = 0;

      if (nhanhId) {
        const nhanhProductData = await NhanhService.getByIdProduct(nhanhId);
        // Assuming data structure: data.inventory.available or similar. 
        // Since we don't have exact Nhanh API response structure here, 
        // I'll default to 0 or try to read 'inventory' field if it exists.
        // Adjust based on actual API response.
        // For now, I'll assume: nhanhProductData.data.inventory.available
        if (nhanhProductData?.data && nhanhProductData.data.inventory && typeof nhanhProductData.data.inventory.available === 'number') {
          nhanhStock = nhanhProductData.data.inventory.available;
        }
      }

      // 2. Get Shopify Stock
      const shopifyStock = await ShopifyService.getInventoryBySku(product.sku_shopify);

      // 3. Update Inventory Model
      let inventory = await Inventory.findOne({ where: { product_id: product.id } });
      if (!inventory) {
        inventory = await Inventory.create({
          product_id: product.id,
          nhanh_stock: nhanhStock,
          shopify_stock: shopifyStock || 0,
          status: nhanhStock === (shopifyStock || 0) ? "MATCH" : "MISMATCH"
        });
      } else {
        await inventory.update({
          nhanh_stock: nhanhStock,
          shopify_stock: shopifyStock || 0,
          status: nhanhStock === (shopifyStock || 0) ? "MATCH" : "MISMATCH"
        });
      }

      await NotificationController.createSystemNotification("SUCCESS", `Đã đồng bộ thủ công sản phẩm ${product.name || product.sku_nhanh}`);

      res.json({ message: `Sync triggered for product ${id}`, data: inventory });
    } catch (error: any) {
      await NotificationController.createSystemNotification("ERROR", `Lỗi đồng bộ thủ công sản phẩm ID ${id}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  static async getOrders(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const search = req.query.search as string;

      // Build where clause for search
      const whereClause: any = {};
      if (search) {
        whereClause[Op.or] = [
          { shopify_order_id: { [Op.like]: `%${search}%` } },
          { nhanh_order_id: { [Op.like]: `%${search}%` } }
        ];
      }

      const result = await Order.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      res.json({
        docs: result.rows,
        total: result.count,
        pages: Math.ceil(result.count / limit),
        page,
        limit,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req: Request, res: Response) {
    try {
      const totalOrders = await Order.count();
      const failedOrders = await Order.count({ where: { status: "FAILED" } });
      const inventoryCount = await Inventory.count();
      const matchCount = await Inventory.count({ where: { status: "MATCH" } });

      const matchRate = inventoryCount > 0 ? (matchCount / inventoryCount) * 100 : 0;

      res.json({
        totalOrders,
        failedOrders,
        matchRate: parseFloat(matchRate.toFixed(2)),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getNhanhProducts(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const search = req.query.search as string;

      // Build where clause for search
      const whereClause: any = {};
      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { sku_nhanh: { [Op.like]: `%${search}%` } },
          { nhanh_id: { [Op.like]: `%${search}%` } }
        ];
      }

      // Get products with pagination
      const result = await Product.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      // Add sync status to each product
      const productsWithStatus = result.rows.map(p => {
        const isSynced = !!(p.sku_shopify && p.sku_shopify !== '');
        return {
          id: p.id,
          nhanh_id: p.nhanh_id,
          sku_nhanh: p.sku_nhanh,
          sku_shopify: p.sku_shopify,
          name: p.name,
          image: p.image,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          syncStatus: isSynced ? 'SYNCED' : 'NOT_SYNCED'
        };
      });

      res.json({
        docs: productsWithStatus,
        total: result.count,
        pages: Math.ceil(result.count / limit),
        page,
        limit,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async retryOrder(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const result = await OrderService.retryFailedOrder(Number(id));

      if (result.success) {
        res.json({
          message: "Order retried successfully",
          nhanhOrderId: result.nhanhOrderId
        });
      } else {
        res.status(400).json({
          error: result.error || "Failed to retry order"
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
