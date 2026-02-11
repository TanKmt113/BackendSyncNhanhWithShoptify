import { Router } from "express";
import * as LogoController from "../controllers/logo.controller";

const router = Router();

// Get current logo
router.get("/", LogoController.getCurrentLogo);

// Save or update logo
router.post("/", LogoController.saveLogo);

// Delete current logo
router.delete("/", LogoController.deleteLogo);

// Get logo history
router.get("/history", LogoController.getLogoHistory);

export default router;
