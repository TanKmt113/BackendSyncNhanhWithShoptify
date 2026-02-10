import { getItemWithID, getAllProducts } from "./nhanh.service";
import * as ShopifyService from "./shopify.service";
import { Request } from "express";
import { Product, Inventory } from "../models";
import { getIO } from "../utils/socket";
import { NotificationController } from "../controllers/notification.controller";

export async function syncInventoryFromNhanhWebhook(data: any[]) {
    let count = 0;
    for (const e of data) {
        const { id, available } = e;

        if (!id) continue;

        const sku = await getItemWithID(id);

        const success = await ShopifyService.updateInventoryByBarcode(sku, available);
        if (success) count++;
    }
    
    if (count > 0) {
        await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã cập nhật tồn kho cho ${count} sản phẩm.`);
    }
}

export async function syncOrderStatusFromNhanhWebhook(id: number, status: string) {

    if (!id) {
        console.warn("Missing order ID in Nhanh webhook data");
        return;
    }

    const success = await ShopifyService.updateOrderStatus(id, status);
    
    if (success) {
        await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã cập cập nhật trạng thái đơn hàng ${id} sang ${status}.`);
    } else {
        await NotificationController.createSystemNotification("WARNING", `Webhook Nhanh.vn: Cập nhật trạng thái đơn hàng ${id} thất bại.`);
    }
}

export async function syncProductAddFromNhanhWebhook(productData: any) {
    try {
        if (!productData || !productData.id) {
            console.warn("Missing product data in Nhanh webhook");
            return;
        }

        const nhanhId = String(productData.id);
        const barcode = productData.barcode || productData.code;
        const name = productData.name;
        const image = productData.images?.avatar || null;

        if (!barcode) {
            console.warn(`Product ${nhanhId} missing barcode/code`);
            return;
        }

        // Check if product already exists on Shopify
        const productExists = await ShopifyService.checkProductExistsBySku(barcode);

        if (productExists) {
            console.log(`Product ${barcode} already exists on Shopify, skipping...`);
            await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name} đã tồn tại trên Shopify.`);
            return;
        }

        // Find or create product in local database
        let product = await Product.findOne({ where: { nhanh_id: nhanhId } });
        
        if (!product) {
            product = await Product.findOne({ where: { sku_nhanh: barcode } });
        }

        if (!product) {
            product = await Product.create({
                nhanh_id: nhanhId,
                sku_nhanh: barcode,
                sku_shopify: null, // Will be set after successful Shopify creation
                name: name,
                image: image
            });
        } else {
            await product.update({ 
                nhanh_id: nhanhId,
                name: name,
                image: image 
            });
        }

        // Create product on Shopify with full data from webhook
        const success = await ShopifyService.createProductOnShopify(product, productData);

        if (success) {
            await product.update({ sku_shopify: barcode });
            await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã tạo sản phẩm mới "${name}" trên Shopify (Draft).`);
            console.log(`Successfully created product ${name} on Shopify from webhook`);
        } else {
            await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi tạo sản phẩm "${name}" trên Shopify.`);
            console.error(`Failed to create product ${name} on Shopify`);
        }
    } catch (error: any) {
        console.error("Error in syncProductAddFromNhanhWebhook:", error);
        await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi xử lý sản phẩm mới - ${error.message}`);
    }
}

export async function syncAllProductsFromNhanh() {
    console.log("Starting full product sync...");
    const io = getIO(); // Get socket instance
    
    try {
        const products = await getAllProducts();
        
        console.log(`Found ${products.length} products from Nhanh.`);
        io.emit("sync_progress", { message: `Found ${products.length} products. Starting sync...`, total: products.length });

        // Tạo thông báo bắt đầu
        await NotificationController.createSystemNotification("INFO", `Bắt đầu đồng bộ ${products.length} sản phẩm.`);

        let syncedCount = 0;
        let createdCount = 0;

        for (const [index, p] of products.entries()) {
            const nhanhId = String(p.id);
            const barcode = p.barcode || p.code;
            const stock = p.inventory?.available || 0;
            const name = p.name;
            const image = p.images?.avatar || null;

            if (!barcode) continue;

            // Check if product exists on Shopify
            const productExists = await ShopifyService.checkProductExistsBySku(barcode);

            let success = false;

            if (!productExists) {
                // Product doesn't exist on Shopify, create it
                console.log(`Creating new product on Shopify: ${name}`);
                
                // Find or create product in local database first
                let product = await Product.findOne({ where: { nhanh_id: nhanhId } });
                if (!product) {
                    product = await Product.findOne({ where: { sku_nhanh: barcode } });
                }
                
                if (!product) {
                    product = await Product.create({
                        nhanh_id: nhanhId,
                        sku_nhanh: barcode,
                        sku_shopify: null, // Will be updated after creation
                        name: name,
                        image: image
                    });
                }

                // Create product on Shopify with full Nhanh data
                success = await ShopifyService.createProductOnShopify(product, p);
                if (success) {
                    createdCount++;
                    // Update sku_shopify after creation
                    await product.update({ sku_shopify: barcode });
                }
            } else {
                // Product exists, just update inventory
                success = await ShopifyService.updateInventoryByBarcode(barcode, stock);
            }

            if (success) {
                syncedCount++;
                let product = await Product.findOne({ where: { nhanh_id: nhanhId } });
                
                if (!product) {
                    product = await Product.findOne({ where: { sku_nhanh: barcode } });
                    if (product) {
                        await product.update({ nhanh_id: nhanhId, name: name, image: image });
                    } else {
                        product = await Product.create({
                            nhanh_id: nhanhId,
                            sku_nhanh: barcode,
                            sku_shopify: barcode,
                            name: name,
                            image: image
                        });
                    }
                } else {
                    await product.update({ 
                        sku_nhanh: barcode, 
                        sku_shopify: barcode,
                        name: name,
                        image: image
                    });
                }

                let inventory = await Inventory.findOne({ where: { product_id: product.id } });
                if (!inventory) {
                    await Inventory.create({
                        product_id: product.id,
                        nhanh_stock: stock,
                        shopify_stock: stock, 
                        status: "MATCH"
                    });
                } else {
                    await inventory.update({
                        nhanh_stock: stock,
                        shopify_stock: stock,
                        status: "MATCH"
                    });
                }
            }
            
            if ((index + 1) % 10 === 0) {
                 io.emit("sync_progress", { 
                     message: `Synced ${index + 1}/${products.length}... (${createdCount} created)`, 
                     processed: index + 1, 
                     total: products.length 
                 });
            }
        }
        
        console.log(`Synced ${syncedCount} products (${createdCount} created, ${syncedCount - createdCount} updated).`);
        
        const successMsg = `Đồng bộ hoàn tất! Tạo mới ${createdCount}, cập nhật ${syncedCount - createdCount}/${products.length} sản phẩm.`;
        
        io.emit("sync_complete", { 
            status: "success", 
            total: products.length, 
            synced: syncedCount,
            created: createdCount,
            message: successMsg
        });

        // Tạo thông báo thành công
        await NotificationController.createSystemNotification("SUCCESS", successMsg);

        return { total: products.length, synced: syncedCount, created: createdCount };

    } catch (error: any) {
        console.error("Full sync error:", error);
        
        const errorMsg = `Lỗi đồng bộ: ${error.message}`;
        io.emit("sync_error", { 
            status: "error", 
            message: errorMsg 
        });

        // Tạo thông báo lỗi
        await NotificationController.createSystemNotification("ERROR", errorMsg);

        throw error;
    }
}