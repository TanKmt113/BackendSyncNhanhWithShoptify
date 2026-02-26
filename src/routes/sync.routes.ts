import { Router } from "express";
import { SyncController } from "../controllers/sync.controller";


const router = Router();

router.post("/inventory/:id", SyncController.syncInventory);
router.post("/all-products", SyncController.syncAllProducts);
router.post("/product-to-shopify/:id", SyncController.syncProductToShopify);

// Đồng bộ sản phẩm từ Nhanh.vn bằng ID (thủ công)
router.post("/product-from-nhanh/:nhanhId", SyncController.syncProductByNhanhId);
router.post("/product-from-nhanh", SyncController.syncProductByNhanhId);

export default router;
