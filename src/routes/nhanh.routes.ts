import { Router } from "express";
import * as NhanhController from "../controllers/nhanh.controller";

const router = Router();
router.get("/install", NhanhController.installApp);
router.get("/callback", NhanhController.authCallback);


export default router;
