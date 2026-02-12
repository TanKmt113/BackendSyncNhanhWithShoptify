import { getItemWithID, getAllProducts } from "./nhanh.service";
import * as ShopifyService from "./shopify.service";
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
        if (success) {
            count++;

            // Update local inventory table
            try {
                let product = await Product.findOne({ where: { sku_nhanh: sku } });
                
                if (!product) {
                    product = await Product.findOne({ where: { sku_shopify: sku } });
                }

                if (product) {
                    let inventory = await Inventory.findOne({ where: { product_id: product.id } });
                    
                    if (!inventory) {
                        await Inventory.create({
                            product_id: product.id,
                            nhanh_stock: available,
                            shopify_stock: available,
                            status: "MATCH"
                        });
                    } else {
                        await inventory.update({
                            nhanh_stock: available,
                            shopify_stock: available,
                            status: "MATCH"
                        });
                    }
                }
            } catch (error: any) {
                console.error(`Error updating inventory for product ${id}:`, error);
            }
        }
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
        console.log(`[syncProductAdd] Starting - Product ID: ${productData?.id}`);

        if (!productData || !productData.id || productData.parentId > 0) {
            console.warn("Missing product data in Nhanh webhook or product is a variant");
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

        // Check if product has variants (childs)
        const hasVariants = productData.childs && Array.isArray(productData.childs) && productData.childs.length > 0;

        if (hasVariants) {
            console.log(`[syncProductAdd] Product ${name} has ${productData.childs.length} variants`);
        }

        console.log(`[syncProductAdd] Checking if product exists on Shopify: ${barcode}`);

        // Check if product already exists on Shopify (check parent barcode)
        const productExists = await ShopifyService.checkProductExistsBySku(barcode);

        console.log(`[syncProductAdd] Product exists check result: ${productExists ? 'YES' : 'NO'}`);

        if (productExists) {
            console.log(`Product ${barcode} already exists on Shopify, skipping...`);
            const variantInfo = hasVariants ? ` (${productData.childs.length} biến thể)` : "";
            await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name}${variantInfo} đã tồn tại trên Shopify.`);
            return;
        }

        // If product has variants, check first variant only (optimization)
        // Instead of checking all variants, just check the first one as sample
        if (hasVariants && productData.childs.length > 0) {
            const firstChild = productData.childs[0];
            const childBarcode = firstChild.barcode || firstChild.code;

            if (childBarcode) {
                console.log(`[syncProductAdd] Checking first variant: ${childBarcode}`);
                const variantExists = await ShopifyService.checkProductExistsBySku(childBarcode);
                console.log(`[syncProductAdd] Variant exists check result: ${variantExists ? 'YES' : 'NO'}`);

                if (variantExists) {
                    console.log(`Variant ${childBarcode} already exists on Shopify, skipping entire product...`);
                    await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name} (biến thể đã tồn tại) trên Shopify.`);
                    return;
                }
            }
        }

        console.log(`[syncProductAdd] Product not exists, proceeding to create...`);

        // Find or create product in local database
        let product = await Product.findOne({ where: { nhanh_id: nhanhId } });

        if (!product) {
            product = await Product.findOne({ where: { sku_nhanh: barcode } });
        }

        if (!product) {
            console.log(`[syncProductAdd] Creating new product in database`);
            product = await Product.create({
                nhanh_id: nhanhId,
                sku_nhanh: barcode,
                sku_shopify: null, // Will be set after successful Shopify creation
                name: name,
                image: image
            });
        } else {
            console.log(`[syncProductAdd] Updating existing product in database`);
            await product.update({
                nhanh_id: nhanhId,
                name: name,
                image: image
            });
        }

        console.log(`[syncProductAdd] Creating product on Shopify...`);

        // Create product on Shopify with full data from webhook (including variants)
        const success = await ShopifyService.createProductOnShopify(product, productData);

        console.log(`[syncProductAdd] Shopify creation result: ${success ? 'SUCCESS' : 'FAILED'}`);

        if (success) {
            await product.update({ sku_shopify: barcode });

            const variantInfo = hasVariants ? ` với ${productData.childs.length} biến thể` : "";
            await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã tạo sản phẩm mới "${name}"${variantInfo} trên Shopify (Draft).`);
            console.log(`[syncProductAdd] Successfully created product ${name}${variantInfo} on Shopify from webhook`);

            // Log variant details for debugging
            if (hasVariants) {
                productData.childs.forEach((child: any, index: number) => {
                    const childBarcode = child.barcode || child.code;
                    const attrs = child.attributes?.map((a: any) => `${a.name}: ${a.value}`).join(", ") || "";
                    console.log(`  Variant ${index + 1}: ${childBarcode} - ${attrs}`);
                });
            }
        } else {
            const variantInfo = hasVariants ? ` (${productData.childs.length} biến thể)` : "";
            await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi tạo sản phẩm "${name}"${variantInfo} trên Shopify.`);
            console.error(`[syncProductAdd] Failed to create product ${name} on Shopify`);
        }

        console.log(`[syncProductAdd] Completed`);
    } catch (error: any) {
        console.error("[syncProductAdd] Error:", error);
        await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi xử lý sản phẩm mới - ${error.message}`);
    }
}

export async function syncAllProductsFromNhanh() {
    console.log("Starting inventory sync for existing products...");
    const io = getIO(); // Get socket instance

    try {
        const products = await getAllProducts();

        console.log(`Found ${products.length} products from Nhanh.`);
        io.emit("sync_progress", { message: `Found ${products.length} products. Starting inventory sync...`, total: products.length });

        // Tạo thông báo bắt đầu
        await NotificationController.createSystemNotification("INFO", `Bắt đầu đồng bộ tồn kho ${products.length} sản phẩm.`);

        let syncedCount = 0;
        let skippedCount = 0;

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
                // Product doesn't exist on Shopify, skip it
                console.log(`Skipping product ${name} (${barcode}) - not found on Shopify`);
                skippedCount++;
                continue;
            } else {
                // Product exists, update inventory
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
                    message: `Synced ${index + 1}/${products.length}... (${skippedCount} skipped)`,
                    processed: index + 1,
                    total: products.length
                });
            }
        }
        console.log(`Synced ${syncedCount} products (${skippedCount} skipped - not found on Shopify).`);
        const successMsg = `Đồng bộ hoàn tất! Cập nhật ${syncedCount}/${products.length} sản phẩm (${skippedCount} chưa có trên Shopify).`;

        io.emit("sync_complete", {
            status: "success",
            total: products.length,
            synced: syncedCount,
            skipped: skippedCount,
            message: successMsg
        });

        // Tạo thông báo thành công
        await NotificationController.createSystemNotification("SUCCESS", successMsg);

        return { total: products.length, synced: syncedCount, skipped: skippedCount };

    } catch (error: any) {
        console.error("Inventory sync error:", error);

        const errorMsg = `Lỗi đồng bộ tồn kho: ${error.message}`;
        io.emit("sync_error", {
            status: "error",
            message: errorMsg
        });
        // Tạo thông báo lỗi
        await NotificationController.createSystemNotification("ERROR", errorMsg);
        throw error;
    }
}