import { Order, Inventory, Product, SyncLog } from "../models";
import * as NhanhService from "./nhanh.service";
import { NotificationController } from "../controllers/notification.controller";

export async function processShopifyOrder(shopifyOrder: any) {
  const syncLog = await SyncLog.create({
    type: "WEBHOOK_ORDER",
    request_payload: shopifyOrder,
    status: "SUCCESS", // Will update if fail
  });

  try {
    const lineItems = shopifyOrder.line_items;
    let sufficientStock = true;
    let missingProduct = false;

    // 1. Check Inventory
    for (const item of lineItems) {
      const sku = item.sku;
      if (!sku) continue;

      // Find product by Shopify SKU (assuming sku_shopify stores the SKU)
      const product = await Product.findOne({ where: { sku_shopify: sku } });
      
      if (!product) {
          // If product not found in DB, we can't check inventory locally.
          console.warn(`Product with SKU ${sku} not found in DB.`);
          missingProduct = true;
          // sufficientStock = false; // Uncomment to be strict
          continue; 
      }

      const inventory = await Inventory.findOne({ where: { product_id: product.id } });
      if (!inventory) {
          console.warn(`Inventory for product ${sku} not found.`);
          // sufficientStock = false;
          continue;
      }

      // Check stock (Assuming we check Nhanh stock because we want to push order to Nhanh)
      if (inventory.nhanh_stock < item.quantity) {
        sufficientStock = false;
        break;
      }
    }

    if (!sufficientStock) {
      await syncLog.update({
        status: "FAILED",
        response_payload: { message: "Insufficient stock" },
      });
      await Order.create({
        shopify_order_id: shopifyOrder.id,
        status: "FAILED",
        error_message: "Insufficient stock",
      });
      await NotificationController.createSystemNotification("ERROR", `Không thể tạo đơn Nhanh.vn cho Shopify Order ${shopifyOrder.id}: Tồn kho không đủ.`);
      return;
    }

    // 2. Call Nhanh API
    // We use the existing service which handles mapping & API call
    const nhanhResponse = await NhanhService.createOrderFromShopify(shopifyOrder);

    // 3. Update DB based on result
    if (nhanhResponse && nhanhResponse.code === 1) {
      const nhanhOrderId = nhanhResponse.data.orderId;
      
      await Order.create({
        shopify_order_id: shopifyOrder.id,
        nhanh_order_id: nhanhOrderId,
        status: "SUCCESS",
      });

      await syncLog.update({
        response_payload: nhanhResponse,
      });

      await NotificationController.createSystemNotification("SUCCESS", `Tạo thành công đơn hàng Nhanh.vn (ID: ${nhanhOrderId}) từ Shopify Order ${shopifyOrder.id}.`);

    } else {
      const errorMsg = nhanhResponse ? JSON.stringify(nhanhResponse) : "Unknown Error from Nhanh API";
      
      await Order.create({
        shopify_order_id: shopifyOrder.id,
        status: "FAILED",
        error_message: errorMsg,
      });

      await syncLog.update({
        status: "FAILED",
        response_payload: nhanhResponse,
      });

      await NotificationController.createSystemNotification("ERROR", `Lỗi tạo đơn hàng Nhanh.vn từ Shopify Order ${shopifyOrder.id}: ${errorMsg}`);
    }

  } catch (error: any) {
    console.error("Error processing shopify order:", error);
    await syncLog.update({
      status: "FAILED",
      response_payload: { error: error.message },
    });
    
    // Save failed order record
    await Order.create({
        shopify_order_id: shopifyOrder.id,
        status: "FAILED",
        error_message: error.message,
      });

    await NotificationController.createSystemNotification("ERROR", `Lỗi ngoại lệ xử lý đơn hàng Shopify ${shopifyOrder.id}: ${error.message}`);
  }
}
