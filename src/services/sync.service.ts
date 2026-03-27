import { getItemWithID, getAllProducts } from "./nhanh.service";
import * as ShopifyService from "./shopify.service";
import { Product } from "../models";
import { getIO } from "../utils/socket";
import { NotificationController } from "../controllers/notification.controller";
import { Op } from "sequelize";
import { logger } from "../utils/logger";

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
                    await product.update({
                        nhanh_stock: available,
                        shopify_stock: available,
                        inventory_status: "MATCH",
                        syncStatus: "SYNCED"
                    });
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
        if (productData.childs)
            productData.childs = productData.childs?.filter((e: any) => e.status != 3) || [];

        if (!barcode) return;

        // Case 1: parentId = -2 hoặc -1
        if (parentId === -2 || parentId === -1) {
            // Kiểm tra xem sản phẩm đã tồn tại trong database local chưa
            let product = await Product.findOne({ where: { nhanh_id: nhanhId } });

            if (!product) {
                product = await Product.findOne({ where: { sku_nhanh: barcode } });
            }

            // Nếu đã tồn tại trong database và đã có sku_shopify, tức là đã được sync rồi
            if (product && product.sku_shopify) {
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name} đã được đồng bộ trước đó.`);
                return;
            }

            // Kiểm tra trên Shopify
            const productExists = await ShopifyService.checkProductExistsBySku(barcode);

            if (productExists) {
                // Nếu đã có trên Shopify nhưng chưa có trong database, tạo record
                if (!product) {
                    await Product.create({
                        nhanh_id: nhanhId,
                        sku_nhanh: barcode,
                        sku_shopify: barcode,
                        name: name,
                        image: image
                    });
                } else {
                    // Update sku_shopify nếu chưa có
                    await product.update({ sku_shopify: barcode, name: name, image: image });
                }
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Sản phẩm ${name} đã tồn tại trên Shopify.`);
                return;
            }

            // Nếu chưa có trong database, tạo mới
            if (!product) {
                product = await Product.create({
                    nhanh_id: nhanhId,
                    sku_nhanh: barcode,
                    sku_shopify: null,
                    name: name,
                    image: image
                });
            } else {
                // Nếu đã có trong database nhưng chưa sync, update thông tin
                await product.update({
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
                // Tạo sản phẩm cha nếu chưa có (chỉ khi parentData có parentId < 0)
                if (parentData.parentId === -2 || parentData.parentId === -1) {
                    await syncProductAddFromNhanhWebhook(parentData);
                }
                await NotificationController.createSystemNotification("WARNING", `Webhook Nhanh.vn: Sản phẩm cha với ID ${parentId} chưa tồn tại trên Shopify. Đang chờ để tạo biến thể "${name}".`);
                return;
            }

            // Kiểm tra biến thể đã tồn tại trong database local chưa
            let product = await Product.findOne({ where: { nhanh_id: nhanhId } });

            if (!product) {
                product = await Product.findOne({ where: { sku_nhanh: barcode } });
            }

            // Nếu đã tồn tại và đã có sku_shopify, tức là đã được sync
            if (product && product.sku_shopify) {
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Biến thể "${name}" đã được đồng bộ trước đó.`);
                return;
            }

            // Kiểm tra biến thể con đã tồn tại trên Shopify chưa
            const variantExists = await ShopifyService.checkProductExistsBySku(barcode);

            if (variantExists) {
                // Nếu có trên Shopify nhưng chưa có trong database, tạo record
                if (!product) {
                    await Product.create({
                        nhanh_id: nhanhId,
                        sku_nhanh: barcode,
                        sku_shopify: barcode,
                        name: name,
                        image: image
                    });
                } else {
                    await product.update({ sku_shopify: barcode, name: name, image: image });
                }
                await NotificationController.createSystemNotification("INFO", `Webhook Nhanh.vn: Biến thể "${name}" đã tồn tại trên Shopify.`);
                return;
            }

            // Thêm biến thể mới vào sản phẩm cha trên Shopify
            const success = await ShopifyService.addVariantToProduct(parentBarcode, productData);

            if (success) {
                await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã thêm biến thể "${name}" vào sản phẩm cha "${parentData.name}" trên Shopify.`);

                // Save variant to local database
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
                        sku_shopify: barcode,
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

export async function syncProductUpdateFromNhanhWebhook(productData: any) {
    try {
        if (!productData || !productData.id) {
            console.warn("Missing product data in Nhanh webhook");
            return;
        }

        const nhanhId = String(productData.id);
        const barcode = productData.barcode || productData.code;
        const name = productData.name || `Product ${nhanhId}`;

        if (!barcode) {
            await NotificationController.createSystemNotification("WARNING", `Webhook Nhanh.vn: Sản phẩm ${name} không có mã SKU để cập nhật giá.`);
            return;
        }

        // Lấy thông tin giá từ productData
        const newPrice = productData.prices?.retail;
        const compareAtPrice = productData.prices?.old;
        const cost = productData.prices?.import;

        if (!newPrice && newPrice !== 0) {
            await NotificationController.createSystemNotification("WARNING", `Webhook Nhanh.vn: Sản phẩm ${name} không có thông tin giá để cập nhật.`);
            return;
        }

        // Tìm variant trên Shopify bằng SKU
        const success = await ShopifyService.updateProductPriceBySku(barcode, {
            price: newPrice,
            compareAtPrice: compareAtPrice,
            cost: cost
        });

        if (success) {
            // Update local database if needed
            try {
                let product = await Product.findOne({ where: { nhanh_id: nhanhId } });

                if (!product) {
                    product = await Product.findOne({ where: { sku_nhanh: barcode } });
                }

                if (product) {
                    await product.update({
                        name: name,
                        image: productData.images?.avatar || product.image
                    });
                }
            } catch (error: any) {
                console.error(`Error updating local product ${nhanhId}:`, error);
            }

            const priceStr = newPrice.toLocaleString('vi-VN');
            await NotificationController.createSystemNotification("SUCCESS", `Webhook Nhanh.vn: Đã cập nhật giá sản phẩm "${name}" thành ${priceStr}đ trên Shopify.`);
        } else {
            await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi cập nhật giá sản phẩm "${name}" (SKU: ${barcode}) trên Shopify.`);
        }

    } catch (error: any) {
        console.error("[syncProductUpdate] Error:", error);
        await NotificationController.createSystemNotification("ERROR", `Webhook Nhanh.vn: Lỗi cập nhật sản phẩm - ${error.message}`);
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

            // 1. Luôn cập nhật hoặc tạo mới sản phẩm trong database local
            let product = await Product.findOne({ where: { nhanh_id: nhanhId } });
            if (!product) {
                product = await Product.findOne({ where: { sku_nhanh: barcode } });
                if (product) {
                    await product.update({ nhanh_id: nhanhId, name: name, image: image });
                } else {
                    product = await Product.create({
                        nhanh_id: nhanhId,
                        sku_nhanh: barcode,
                        sku_shopify: null, // Mặc định là null cho đến khi tìm thấy trên Shopify
                        name: name,
                        image: image,
                        syncStatus: "NOT_SYNCED"
                    });
                }
            } else {
                await product.update({
                    sku_nhanh: barcode,
                    name: name,
                    image: image
                });
            }

            // 2. Kiểm tra tồn tại trên Shopify
            const productExists = await ShopifyService.checkProductExistsBySku(barcode);

            if (productExists) {
                // Sản phẩm có trên Shopify, cập nhật tồn kho và trạng thái
                const success = await ShopifyService.updateInventoryByBarcode(barcode, stock);
                if (success) {
                    syncedCount++;
                    await product.update({
                        sku_shopify: barcode,
                        nhanh_stock: stock,
                        shopify_stock: stock,
                        inventory_status: "MATCH",
                        syncStatus: "SYNCED"
                    });
                } else {
                    // Cập nhật stock nhưng đánh dấu lỗi sync nếu cần hoặc giữ nguyên
                    await product.update({
                        sku_shopify: barcode,
                        nhanh_stock: stock,
                        syncStatus: "SYNCED"
                    });
                }
            } else {
                // Không có trên Shopify
                skippedCount++;
                await product.update({
                    nhanh_stock: stock,
                    syncStatus: "NOT_SYNCED"
                });
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

/**
 * Đồng bộ ảnh sản phẩm từ Shopify về Nhanh.vn cho một SKU cụ thể.
 * @param sku Mã SKU của sản phẩm.
 * @returns true nếu thành công, false nếu thất bại.
 */
export async function syncProductImagesFromShopifyBySku(sku: string): Promise<boolean> {
    try {
        // 1. Tìm sản phẩm trong DB để lấy nhanh_id
        const product = await Product.findOne({
            where: {
                [Op.or]: [
                    { sku_shopify: sku },
                    { sku_nhanh: sku }
                ]
            }
        });

        if (!product || !product.nhanh_id) {
            logger.warn(`Không tìm thấy sản phẩm hoặc nhanhId cho SKU ${sku} trong database local.`);
            return false;
        }

        // 2. Lấy ảnh từ Shopify
        const imageUrls = await ShopifyService.getProductImagesBySku(sku);

        if (imageUrls.length === 0) {
            logger.info(`Sản phẩm SKU ${sku} không có ảnh trên Shopify.`);
            return true; // Coi như thành công nếu không có ảnh để đồng bộ
        }

        // 3. Cập nhật ảnh lên Nhanh.vn
        const { updateProductImages } = await import("./nhanh.service");
        const success = await updateProductImages(product.nhanh_id, imageUrls);

        if (success) {
            // Cập nhật ảnh đại diện vào DB local nếu cần
            if (imageUrls[0] !== product.image) {
                await product.update({ image: imageUrls[0] });
            }
            return true;
        }

        return false;
    } catch (error: any) {
        logger.error(`Lỗi khi đồng bộ ảnh từ Shopify cho SKU ${sku}:`, error);
        return false;
    }
}

/**
 * Đồng bộ ảnh cho toàn bộ sản phẩm từ Shopify về Nhanh.vn.
 */
export async function syncAllProductImagesFromShopify() {
    const io = getIO();
    try {
        const products = await Product.findAll({
            where: {
                nhanh_id: { [Op.ne]: null },
                sku_shopify: { [Op.ne]: null }
            }
        });

        io.emit("sync_progress", { message: `Bắt đầu đồng bộ ảnh cho ${products.length} sản phẩm...`, total: products.length });
        await NotificationController.createSystemNotification("INFO", `Bắt đầu đồng bộ ảnh cho ${products.length} sản phẩm từ Shopify.`);

        let successCount = 0;
        let failCount = 0;

        for (const [index, product] of products.entries()) {
            const sku = product.sku_shopify || product.sku_nhanh;
            if (!sku) continue;

            const success = await syncProductImagesFromShopifyBySku(sku);
            if (success) successCount++;
            else failCount++;

            if ((index + 1) % 5 === 0) {
                io.emit("sync_progress", {
                    message: `Đang đồng bộ ảnh ${index + 1}/${products.length}...`,
                    processed: index + 1,
                    total: products.length
                });
            }
        }

        const msg = `Hoàn tất đồng bộ ảnh: ${successCount} thành công, ${failCount} thất bại.`;
        io.emit("sync_complete", { status: "success", message: msg });
        await NotificationController.createSystemNotification("SUCCESS", msg);

        return { total: products.length, success: successCount, fail: failCount };
    } catch (error: any) {
        logger.error("Lỗi đồng bộ toàn bộ ảnh từ Shopify:", error);
        io.emit("sync_error", { message: `Lỗi đồng bộ ảnh: ${error.message}` });
        throw error;
    }
}