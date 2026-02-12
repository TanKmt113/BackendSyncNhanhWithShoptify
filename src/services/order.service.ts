import { Order, Inventory, Product, SyncLog } from "../models";
import * as NhanhService from "./nhanh.service";
import { NotificationController } from "../controllers/notification.controller";

export async function processShopifyOrder(shopifyOrder: any) {
  try {
    // 0. Kiểm tra xem order đã được xử lý chưa (để tránh duplicate khi Shopify gửi webhook nhiều lần)
    const existingOrder = await Order.findOne({
      where: { shopify_order_id: shopifyOrder.id }
    });

    if (existingOrder) {
      if (existingOrder.status === "SUCCESS") {
        console.log(`Order ${shopifyOrder.id} already processed successfully. Skipping...`);
        return;
      } else {
        console.log(`Order ${shopifyOrder.id} exists with FAILED status. Will retry processing...`);
        // Tiếp tục xử lý để retry
      }
    }

    const syncLog = await SyncLog.create({
      type: "WEBHOOK_ORDER",
      request_payload: shopifyOrder,
      status: "SUCCESS", // Will update if fail
    });

    try {
      // 2. Call Nhanh API
      // We use the existing service which handles mapping & API call
      const nhanhResponse = await NhanhService.createOrderFromShopify(shopifyOrder);

      // 3. Update DB based on result
      if (nhanhResponse && nhanhResponse.code === 1) {
        const nhanhOrderId = nhanhResponse.data.id;
        
        if (existingOrder) {
          // Update existing failed order
          await existingOrder.update({
            nhanh_order_id: nhanhOrderId,
            status: "SUCCESS",
            error_message: null,
            order_data: shopifyOrder,
            shipping_address: shopifyOrder.shipping_address,
            line_items: shopifyOrder.line_items,
          });
        } else {
          // Create new order record
          await Order.create({
            shopify_order_id: shopifyOrder.id,
            nhanh_order_id: nhanhOrderId,
            status: "SUCCESS",
            order_data: shopifyOrder,
            shipping_address: shopifyOrder.shipping_address,
            line_items: shopifyOrder.line_items,
          });
        }

        await syncLog.update({
          response_payload: nhanhResponse,
        });

        await NotificationController.createSystemNotification("SUCCESS", `Tạo thành công đơn hàng Nhanh.vn (ID: ${nhanhOrderId}) từ Shopify Order ${shopifyOrder.id}.`);

      } else {
        const errorMsg = nhanhResponse ? JSON.stringify(nhanhResponse) : "Unknown Error from Nhanh API";
        
        if (existingOrder) {
          // Update existing order
          await existingOrder.update({
            error_message: errorMsg,
            order_data: shopifyOrder,
            shipping_address: shopifyOrder.shipping_address,
            line_items: shopifyOrder.line_items,
          });
        } else {
          // Create new failed order
          await Order.create({
            shopify_order_id: shopifyOrder.id,
            status: "FAILED",
            error_message: errorMsg,
            order_data: shopifyOrder,
            shipping_address: shopifyOrder.shipping_address,
            line_items: shopifyOrder.line_items,
          });
        }

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
      
      if (existingOrder) {
        // Update existing order
        await existingOrder.update({
          error_message: error.message,
          order_data: shopifyOrder,
          shipping_address: shopifyOrder.shipping_address,
          line_items: shopifyOrder.line_items,
        });
      } else {
        // Save failed order record
        await Order.create({
          shopify_order_id: shopifyOrder.id,
          status: "FAILED",
          error_message: error.message,
          order_data: shopifyOrder,
          shipping_address: shopifyOrder.shipping_address,
          line_items: shopifyOrder.line_items,
        });
      }

      await NotificationController.createSystemNotification("ERROR", `Lỗi ngoại lệ xử lý đơn hàng Shopify ${shopifyOrder.id}: ${error.message}`);
    }
  } catch (error: any) {
    console.error("Fatal error in processShopifyOrder:", error);
    throw error;
  }
}

export async function retryFailedOrder(orderId: number) {
  try {
    // 1. Tìm order thất bại từ database
    const order = await Order.findByPk(orderId);
    console.log('Retrying order:', order?.id);
    
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "FAILED") {
      throw new Error("Only failed orders can be retried");
    }

    // 2. Lấy thông tin đơn hàng từ database (đã lưu khi nhận webhook)
    const shopifyOrder = order.order_data;

    if (!shopifyOrder) {
      throw new Error(`Order data not found in database for order ${order.shopify_order_id}. Order must be created via webhook.`);
    }

    // 3. Tạo sync log mới cho lần retry
    const retrySyncLog = await SyncLog.create({
      type: "WEBHOOK_ORDER_RETRY",
      request_payload: shopifyOrder,
      status: "SUCCESS",
    });

    try {
      // 4. Gọi lại Nhanh API
      const nhanhResponse = await NhanhService.createOrderFromShopify(shopifyOrder);
      // 5. Cập nhật kết quả
      if (nhanhResponse && nhanhResponse.code === 1) {
        const nhanhOrderId = nhanhResponse.data.id;
        
        await order.update({
          nhanh_order_id: nhanhOrderId,
          status: "SUCCESS",
          error_message: null,
        });

        await retrySyncLog.update({
          response_payload: nhanhResponse,
        });

        await NotificationController.createSystemNotification(
          "SUCCESS",
          `Retry thành công! Đã tạo đơn hàng Nhanh.vn (ID: ${nhanhOrderId}) từ Shopify Order ${shopifyOrder.id}.`
        );

        return { success: true, nhanhOrderId };
      } else {
        const errorMsg = nhanhResponse ? JSON.stringify(nhanhResponse) : "Unknown Error from Nhanh API";
        
        await order.update({
          error_message: errorMsg,
        });

        await retrySyncLog.update({
          status: "FAILED",
          response_payload: nhanhResponse,
        });

        await NotificationController.createSystemNotification(
          "ERROR",
          `Retry thất bại: ${errorMsg}`
        );

        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      await retrySyncLog.update({
        status: "FAILED",
        response_payload: { error: error.message },
      });

      await order.update({
        error_message: error.message,
      });

      await NotificationController.createSystemNotification(
        "ERROR",
        `Retry thất bại: ${error.message}`
      );

      throw error;
    }
  } catch (error: any) {
    console.error("Error retrying order:", error);
    throw error;
  }
}
