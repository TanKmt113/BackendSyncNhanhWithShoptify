import { Request, Response, NextFunction } from "express";
// import * as NhanhService from "../services/nhanh.service";
import * as SyncService from "../services/sync.service";
import * as ShopifyService from "../services/shopify.service";
import * as OrderService from "../services/order.service";
import { getConfig } from "../services/config.service";
import { Json } from "sequelize/types/utils";


export async function shopifyOrderCreated(req: Request, res: Response, next: NextFunction) {
  try {
    const shopifyOrder = req.body;
    // Process order asynchronously to avoid timeout if needed, or await if fast enough.
    // Given the logic involves DB and API calls, awaiting is safer to ensure completion before response 
    // OR return 200 OK immediately and process in background. 
    // Webhooks usually expect 200 OK fast. I'll await but wrap in try-catch properly.
    await OrderService.processShopifyOrder(shopifyOrder);
    res.status(200).send("ok");
  } catch (err) {
    next(err);
  }
}

export async function syncDataNhanh(req: Request, res: Response, next: NextFunction) {

  const config = await getConfig();

  const mapStatus: any = {
    43: {
      nhanh_status: "Chờ thu gom",
      shopify_status: "Fulfilled"
    },
    58: {
      nhanh_status: "Hãng vận chuyển hủy đơn",
      shopify_status: "Canceled"
    },
    59: {
      nhanh_status: "Đang chuyển",
      shopify_status: "Fulfilled"
    },
    60: {
      nhanh_status: "Thành công",
      shopify_status: "Archived"
    },
    61: {
      nhanh_status: "Thất bại",
      shopify_status: "Canceled"
    },
    63: {
      nhanh_status: "Khách hủy",
      shopify_status: "Canceled"
    },
    64: {
      nhanh_status: "Hệ thống hủy",
      shopify_status: "Canceled"
    },
    71: {
      nhanh_status: "Đang chuyển hoàn",
      shopify_status: "Canceled"
    },
    72: {
      nhanh_status: "Đã chuyển hoàn",
      shopify_status: "Canceled"
    },
    74: {
      nhanh_status: "Xác nhận hoàn",
      shopify_status: "Canceled"
    }
  }
  try {
    const webhookData = req.body;
    const { event, data } = webhookData;

    switch (event) {
      case 'orderUpdate':
        const { channel, info } = data;

        // Validate channel and appOrderId exist
        if (!channel || !channel.appOrderId) {
          console.warn(`[Webhook Nhanh] orderUpdate missing channel.appOrderId`, data);
          return res.status(200).json({ success: true, message: "No appOrderId to process" });
        }

        const parts = channel.appOrderId.split('_');
        const NHANH_APP_ID_FROM_ORDER = parts[1];
        if (Number(NHANH_APP_ID_FROM_ORDER) === Number(config.nhanh_app_id)) {
          const status = mapStatus[info.status]?.shopify_status || null
          if (!!status) await SyncService.syncOrderStatusFromNhanhWebhook(Number(parts[0]), status);
        }
        break;
      case 'orderDelete':
        break
      case 'inventoryChange':
        await SyncService.syncInventoryFromNhanhWebhook(data);
        break;
      case 'productAdd':
        console.log(`[Webhook Nhanh] Received productAdd event for product: ${JSON.stringify(data)}`);
        await SyncService.syncProductAddFromNhanhWebhook(data);
        break;
      default:
        console.warn(`[Webhook Nhanh] Unknown event type: ${event}`);
        break;
    }
    return res.status(200).json({ success: true, message: "Received" });
  } catch (error) {
    next(error);
  }
}

export async function testSync(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, status } = req.body;
    await ShopifyService.updateOrderStatus(id, status);
    res.status(200).send("ok");
  } catch (err) {
    next(err);
  }
}

// export async function testProductAdd(req: Request, res: Response, next: NextFunction) {

//   try {
//     const productData = req.body;

//     console.log(`[testProductAdd] Received request for product: ${productData?.name || productData?.id}`);

//     // Validate basic product data
//     if (!productData || !productData.id) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing product data or product ID"
//       });
//     }

//     // Set timeout for the operation (60 seconds)
//     const timeoutPromise = new Promise((_, reject) =>
//       setTimeout(() => reject(new Error('Operation timeout after 60 seconds')), 60000)
//     );

//     // Call the sync function with timeout
//     await Promise.race([
//       SyncService.syncProductAddFromNhanhWebhook(productData),
//       timeoutPromise
//     ]);

//     console.log(`[testProductAdd] Request completed successfully`);

//     return res.status(200).json({
//       success: true,
//       message: `Product ${productData.name || productData.id} processed successfully`,
//       hasVariants: !!(productData.childs && productData.childs.length > 0),
//       variantsCount: productData.childs?.length || 0
//     });
//   } catch (err: any) {
//     console.error(`[testProductAdd] Error:`, err.message);

//     if (err.message?.includes('timeout')) {
//       return res.status(408).json({
//         success: false,
//         message: 'Request timeout - operation took too long',
//         error: err.message
//       });
//     }

//     next(err);
//   }
// }
