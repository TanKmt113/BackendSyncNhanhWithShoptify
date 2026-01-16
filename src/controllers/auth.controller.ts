import { Request, Response } from "express";
import authService from "../services/auth.service";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

class AuthController {
    async register(req: Request, res: Response) {
        try {
            const user = await authService.register(req.body);
            res.status(201).json({ success: true, data: user });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const { token, user } = await authService.login(req.body);

            res.cookie("auth_token", token, {
                httpOnly: true,
                // secure: process.env.NODE_ENV === "production",
                domain: ".tandotrong.online",
                secure: true,
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
                path: "/",
            });

            res.status(200).json({ success: true, user });
        } catch (error: any) {
            res.status(401).json({ success: false, message: error.message });
        }
    }


    async logout(req: Request, res: Response) {
        res.clearCookie("auth_token", {
            httpOnly: true,
            sameSite: "none",
             domain: ".tandotrong.online",
            secure: process.env.NODE_ENV === "production",
            path: "/",
        });

        return res.json({
            success: true,
            message: "Logged out successfully",
        });
    };

    async googleCallback(req: Request, res: Response) {
        try {
            // User is already attached to req.user by passport
            const user: any = req.user;

            if (!user) {
                return res.status(401).json({ success: false, message: "Authentication failed" });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: "24h" }
            );

            // Redirect to frontend with token
            // Ensure FRONTEND_URL is set in .env, otherwise default to localhost:3000
            const frontendUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
            res.redirect(`${frontendUrl}/auth/success?token=${token}`);

        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getMe(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const user = await authService.getMe(userId);
            res.status(200).json({ success: true, data: user });
        } catch (error: any) {
            res.status(404).json({ success: false, message: error.message });
        }
    }
}

export default new AuthController();
