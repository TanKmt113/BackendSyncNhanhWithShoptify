import { Request, Response, NextFunction } from "express";
import * as LogoService from "../services/logo.service";

/**
 * Get current logo
 * GET /api/logo
 */
export async function getCurrentLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const logo = await LogoService.getCurrentLogo();

    if (!logo) {
      return res.status(404).json({
        success: false,
        message: "No logo found",
      });
    }

    return res.status(200).json({
      success: true,
      data: logo,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Save or update logo
 * POST /api/logo
 * Body: { logo_url, logo_name?, file_type?, file_size? }
 */
export async function saveLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const { logo_url, logo_name, file_type, file_size } = req.body;

    // Validate required fields
    if (!logo_url) {
      return res.status(400).json({
        success: false,
        message: "logo_url is required",
      });
    }

    // Validate logo_url format (base64 or URL)
    const isBase64 = logo_url.startsWith("data:image/");
    const isUrl = logo_url.startsWith("http://") || logo_url.startsWith("https://");

    if (!isBase64 && !isUrl) {
      return res.status(400).json({
        success: false,
        message: "logo_url must be a valid URL or base64 image data",
      });
    }

    const logoData = {
      logo_url,
      logo_name: logo_name || undefined,
      file_type: file_type || undefined,
      file_size: file_size ? parseInt(file_size) : undefined,
    };

    const savedLogo = await LogoService.saveLogo(logoData);

    return res.status(200).json({
      success: true,
      message: "Logo saved successfully",
      data: savedLogo,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete current logo
 * DELETE /api/logo
 */
export async function deleteLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const deleted = await LogoService.deleteLogo();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "No logo to delete",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logo deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get logo history
 * GET /api/logo/history
 */
export async function getLogoHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const history = await LogoService.getLogoHistory(limit);

    return res.status(200).json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    next(error);
  }
}
