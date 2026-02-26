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

        if (!productData || !productData.id) return;

        const nhanhId = String(productData.id);
        const barcode = productData.barcode || productData.code;
        const name = productData.name;
        const image = productData.images?.avatar || null;
        const parentId = productData.parentId;

        if (!barcode) return;

        // Case 1: parentId = -2 hoặc -1
        if (parentId === -2 || parentId === -1) {
            const productExists = await ShopifyService.checkProductExistsBySku(barcode);

            if (productExists) {
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name} đã tồn tại trên Shopify.`);
                return;
            }

            let product = await Product.findOne({ where: { nhanh_id: nhanhId } });

            if (!product) {
                product = await Product.findOne({ where: { sku_nhanh: barcode } });
            }

            if (!product) {
                product = await Product.create({
                    nhanh_id: nhanhId,
                    sku_nhanh: barcode,
                    sku_shopify: null,
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

            let filteredChilds: any[] = [];
            if (productData.childs && Array.isArray(productData.childs) && productData.childs.length > 0) {
                for (const child of productData.childs) {
                    const childBarcode = child.barcode || child.code;
                    if (childBarcode) {
                        const childExists = await ShopifyService.checkProductExistsBySku(childBarcode);
                        if (!childExists) filteredChilds.push(child);
                    }
                }
            }

            // Create parent product on Shopify with filtered childs
            const productDataWithFilteredChilds = { ...productData, childs: filteredChilds };
            const success = await ShopifyService.createProductOnShopify(product, productDataWithFilteredChilds);

            if (success) {
                await product.update({ sku_shopify: barcode });
                const variantInfo = filteredChilds.length > 0 ? ` với ${filteredChilds.length} biến thể` : "";
                await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã tạo sản phẩm "${name}"${variantInfo} trên Shopify (Draft).`);
            } else {
                await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi tạo sản phẩm "${name}" trên Shopify.`);
                console.error(`[syncProductAdd] Failed to create product ${name} on Shopify`);
            }

            return;
        }

        if (parentId > 0) {
            // Lấy thông tin sản phẩm cha từ Nhanh.vn
            const { getByIdProduct } = await import("./nhanh.service");
            const parentResponse = await getByIdProduct(parentId);
            const parentData = parentResponse?.data;

            if (!parentData) {
                await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Không tìm thấy sản phẩm cha với ID ${parentId} trên Nhanh.vn.`);
                return;
            }

            const parentBarcode = parentData.barcode || parentData.code;

            if (!parentBarcode) {
                await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Sản phẩm cha không có barcode.`);
                return;
            }

            // Tìm sản phẩm cha trên Shopify - nếu chưa có thì return
            const parentProductExists = await ShopifyService.checkProductExistsBySku(parentBarcode);

            if (!parentProductExists) {
                await NotificationController.createSystemNotification("WARNING", `Webhook Nhanh.vn: Sản phẩm cha "${parentData.name}" chưa tồn tại trên Shopify. Không thể thêm biến thể.`);
                return;
            }

            // Kiểm tra biến thể con đã tồn tại trên Shopify chưa
            const variantExists = await ShopifyService.checkProductExistsBySku(barcode);

            if (variantExists) {
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Biến thể "${name}" đã tồn tại trên Shopify.`);
                return;
            }

            // Thêm biến thể mới vào sản phẩm cha trên Shopify
            const success = await ShopifyService.addVariantToProduct(parentBarcode, productData);

            if (success) {
                await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã thêm biến thể "${name}" vào sản phẩm cha "${parentData.name}" trên Shopify.`);

                // Save variant to local database
                let product = await Product.findOne({ where: { nhanh_id: nhanhId } });
                if (!product) {
                    await Product.create({
                        nhanh_id: nhanhId,
                        sku_nhanh: barcode,
                        sku_shopify: barcode,
                        name: name,
                        image: image
                    });
                } else {
                    await product.update({
                        sku_nhanh: barcode,
                        name: name,
                        image: image
                    });
                }
            } else {
                await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi thêm biến thể "${name}" vào sản phẩm cha trên Shopify.`);
            }

            return;
        }

    } catch (error: any) {
        console.error("[syncProductAdd] Error:", error);
        await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi xử lý sản phẩm mới - ${error.message}`);
    }
}

export async function syncAllProductsFromNhanh() {
    const io = getIO(); // Get socket instance

    try {
        const products = await getAllProducts();

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