import type { Request, Response, NextFunction } from "express";
import * as NhanhService from "../services/nhanh.service";

export async function installApp(req: Request, res: Response, next: NextFunction) {
    try {
        const redirectUrl = await NhanhService.getInstallUrl();
        return res.redirect(redirectUrl);
    } catch (err) {
        next(err);
    }
}

export async function authCallback(req: Request, res: Response, next: NextFunction) {
    try {
        const { accessCode } = req.query;
        const result = await NhanhService.getCodeToken(accessCode as string);
        if (result) {
            // Redirect to frontend get-token page with accessCode
            return res.redirect(`${process.env.CLIENT_URL}/nhanh/get-token?accessCode=${accessCode}`);
        } else {
            return res.send("Lỗi khi lấy Access Token từ Nhanh.vn");
        }
    } catch (err) {
        next(err);
    }
}


