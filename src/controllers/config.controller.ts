import { Request, Response } from "express";
import * as ConfigService from "../services/config.service";

export class ConfigController {
    
    static async getConfig(req: Request, res: Response) {
        try {
            const config = await ConfigService.getConfig();
            // Mask secrets when sending to frontend? 
            // Usually we send blank or ******* to security.
            // For now sending as is so user can see what they saved.
            res.json(config);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateConfig(req: Request, res: Response) {
        try {
            const data = req.body;
            const updated = await ConfigService.updateConfig(data);
            res.json({ success: true, config: updated });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}
