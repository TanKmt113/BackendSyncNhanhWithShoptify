import { Router } from "express";
import authController from "../controllers/auth.controller";
import passport from "passport";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/me", authenticateToken, authController.getMe);

// Initiate Google Login
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Handle Google Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  authController.googleCallback
);

export default router;
