import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";

const router = Router();

router.get("/inventory", DashboardController.getInventory);
router.get("/test-socket", DashboardController.testSocket);
router.get("/orders", DashboardController.getOrders);
router.get("/stats", DashboardController.getStats);
router.get("/nhanh-products", DashboardController.getNhanhProducts);

export default router;
