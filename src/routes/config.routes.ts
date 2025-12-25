import { Router } from "express";
import { ConfigController } from "../controllers/config.controller";

const router = Router();

router.get("/", ConfigController.getConfig);
router.post("/", ConfigController.updateConfig);

export default router;
