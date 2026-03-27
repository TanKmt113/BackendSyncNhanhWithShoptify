import { Router } from "express";
import { SyncController } from "../controllers/sync.controller";


const router = Router();

router.post("/inventory/:id", SyncController.syncInventory);
router.post("/all-products", SyncController.syncAllProducts);

// Đồng bộ sản phẩm từ Nhanh.vn bằng ID (thủ công)
router.post("/product-from-nhanh/:nhanhId", SyncController.syncProductByNhanhId);
router.post("/product-from-nhanh", SyncController.syncProductByNhanhId);

// Đồng bộ ảnh sản phẩm từ Shopify về Nhanh.vn
router.post("/images/:sku", SyncController.syncProductImages);
router.post("/images-all", SyncController.syncAllProductImages);

export default router;
