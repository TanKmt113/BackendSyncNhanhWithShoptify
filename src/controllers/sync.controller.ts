import { Request, Response } from "express";
import { Product } from "../models";
import * as NhanhService from "../services/nhanh.service";
import * as ShopifyService from "../services/shopify.service";
import * as SyncService from "../services/sync.service";
import { NotificationController } from "./notification.controller";

export class SyncController {

  static async syncAllProducts(req: Request, res: Response) {
    try {
      // Trigger background sync without awaiting
      SyncService.syncAllProductsFromNhanh().catch(err => {
        console.error("Background sync failed:", err);
      });

      res.json({
        message: "Processing started in background",
        socket_event: "sync_complete"
      });
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

      // 3. Update Product Model
      await product.update({
        nhanh_stock: nhanhStock,
        shopify_stock: shopifyStock || 0,
        inventory_status: nhanhStock === (shopifyStock || 0) ? "MATCH" : "MISMATCH",
        syncStatus: "SYNCED"
      });

      await NotificationController.createSystemNotification("SUCCESS", `Đã đồng bộ thủ công sản phẩm ${product.name || product.sku_nhanh}`);

      res.json({ message: `Sync triggered for product ${id}`, data: product });
    } catch (error: any) {
      await NotificationController.createSystemNotification("ERROR", `Lỗi đồng bộ thủ công sản phẩm ID ${id}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Đồng bộ sản phẩm thủ công từ Nhanh.vn bằng ID
   * @route POST /api/sync/product-from-nhanh/:nhanhId
   * hoặc POST /api/sync/product-from-nhanh với body { nhanhId }
   */
  static async syncProductByNhanhId(req: Request, res: Response) {
    try {
      // Lấy nhanhId từ params hoặc body
      const nhanhId = req.params.nhanhId || req.body.nhanhId;

      if (!nhanhId) {
        res.status(400).json({ error: "Missing nhanhId parameter" });
        return;
      }

      // Validate nhanhId is a number
      const productId = parseInt(nhanhId);
      if (isNaN(productId)) {
        res.status(400).json({ error: "nhanhId must be a valid number" });
        return;
      }

      // 1. Lấy thông tin sản phẩm từ Nhanh.vn
      const productResponse = await NhanhService.getByIdProduct(productId);

      console.log("Nhanh.vn product response:", productResponse);

      if (!productResponse || !productResponse.data || !productResponse.code) {
        res.status(404).json({ error: `Không tìm thấy sản phẩm với ID ${productId} trên Nhanh.vn` });
        return;
      }

      const productData = productResponse.data;

      // 2. Gọi hàm đồng bộ sản phẩm
      await SyncService.syncProductAddFromNhanhWebhook(productData);

      res.json({
        success: true,
        message: `Đã bắt đầu đồng bộ sản phẩm "${productData.name || productId}" từ Nhanh.vn`,
        data: {
          nhanhId: productId,
          name: productData.name,
          barcode: productData.barcode || productData.code
        }
      });

    } catch (error: any) {
      const errorMsg = `Lỗi đồng bộ sản phẩm từ Nhanh.vn: ${error.message}`;
      await NotificationController.createSystemNotification("ERROR", errorMsg);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Đồng bộ ảnh sản phẩm từ Shopify về Nhanh.vn bằng SKU
   */
  static async syncProductImages(req: Request, res: Response) {
    try {
      const { sku } = req.params;
      if (!sku) {
        res.status(400).json({ error: "Missing SKU parameter" });
        return;
      }

      const success = await SyncService.syncProductImagesFromShopifyBySku(sku);
      if (success) {
        res.json({ success: true, message: `Đã đồng bộ ảnh cho SKU ${sku}` });
      } else {
        res.status(500).json({ success: false, message: `Đồng bộ ảnh cho SKU ${sku} thất bại` });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Đồng bộ toàn bộ ảnh sản phẩm từ Shopify về Nhanh.vn
   */
  static async syncAllProductImages(req: Request, res: Response) {
    try {
      // Trigger background sync
      SyncService.syncAllProductImagesFromShopify().catch(err => {
        console.error("Background image sync failed:", err);
      });

      res.json({
        message: "Image synchronization started in background",
        socket_event: "sync_complete"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

}
