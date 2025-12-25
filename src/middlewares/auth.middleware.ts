import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "Access Token Required" });
    }

    jwt.verify(token, process.env.JWT_SECRET || "default_secret", (err: any, user: any) => {
        if (err) {
            return res.status(403).json({ success: false, message: "Invalid Token" });
        }
        req.user = user;
        next();
    });
};
