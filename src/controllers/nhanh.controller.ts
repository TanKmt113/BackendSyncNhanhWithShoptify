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
        const token = await NhanhService.getCodeToken(accessCode as string);
        return res.send("App installed successfully " + token);
    } catch (err) {
        next(err);
    }
}



