import { Router } from "express";
import { validateShopifyWebhook } from "../middlewares/validateShopifyWebhook";
import * as WebhookController from "../controllers/webhook.controller";

const router = Router();

router.post(
  "/shopify/orders-create",
  validateShopifyWebhook,
  WebhookController.shopifyOrderCreated
);

router.post(
  "/nhanh",
  WebhookController.syncDataNhanh
);


router.post(
  "/test-sync",
  WebhookController.testSync
);

// router.post(
//   "/test-product-add",
//   WebhookController.testProductAdd
// );


export default router;
