import { Router } from "express";
import { SyncController } from "../controllers/sync.controller";


const router = Router();

router.post("/inventory/:id", SyncController.syncInventory);
router.post("/all-products", SyncController.syncAllProducts);
router.post("/product-to-shopify/:id", SyncController.syncProductToShopify);

export default router;
