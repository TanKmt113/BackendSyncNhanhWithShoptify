import Logo from "../models/Logo";
import { logger } from "../utils/logger";

/**
 * Get the current logo
 * @returns Logo object or null if not exists
 */
export async function getCurrentLogo() {
  try {
    // Get the most recent logo
    const logo = await Logo.findOne({
      order: [["created_at", "DESC"]],
    });
    return logo;
  } catch (error: any) {
    logger.error("Error getting current logo:", error);
    throw error;
  }
}

/**
 * Save or update logo
 * @param logoData Logo data including URL, name, type, size
 * @returns Saved logo object
 */
export async function saveLogo(logoData: {
  logo_url: string;
  logo_name?: string;
  file_type?: string;
  file_size?: number;
}) {
  try {
    // Check if logo already exists
    const existingLogo = await Logo.findOne({
      order: [["created_at", "DESC"]],
    });

    if (existingLogo) {
      // Update existing logo
      await existingLogo.update(logoData);
      logger.info(`Logo updated: ${logoData.logo_name || "Unnamed"}`);
      return existingLogo;
    } else {
      // Create new logo
      const newLogo = await Logo.create(logoData);
      logger.info(`Logo created: ${logoData.logo_name || "Unnamed"}`);
      return newLogo;
    }
  } catch (error: any) {
    logger.error("Error saving logo:", error);
    throw error;
  }
}

/**
 * Delete the current logo
 * @returns true if deleted successfully
 */
export async function deleteLogo() {
  try {
    const logo = await Logo.findOne({
      order: [["created_at", "DESC"]],
    });

    if (logo) {
      await logo.destroy();
      logger.info("Logo deleted successfully");
      return true;
    }

    return false;
  } catch (error: any) {
    logger.error("Error deleting logo:", error);
    throw error;
  }
}

/**
 * Get all logo history
 * @param limit Maximum number of records to return
 * @returns Array of logo objects
 */
export async function getLogoHistory(limit: number = 10) {
  try {
    const logos = await Logo.findAll({
      order: [["created_at", "DESC"]],
      limit,
    });
    return logos;
  } catch (error: any) {
    logger.error("Error getting logo history:", error);
    throw error;
  }
}
