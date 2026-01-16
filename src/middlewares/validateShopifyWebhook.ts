import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getConfig } from "../services/config.service";

export async function validateShopifyWebhook(req: Request, res: Response, next: NextFunction) {

  const config = await getConfig();
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const secret = config.shopify_webhook_secret;

  if (!secret) {
    console.warn("Skipping Webhook Validation: SHOPIFY_WEBHOOK_SECRET not configured in .env");
    return next();
  }

  if (!hmacHeader) {
    return res.status(401).send("Missing X-Shopify-Hmac-Sha256 header");
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return res.status(500).send("Server Error: Raw body not available for signature verification");
  }

  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    // Use timing safe equal for security
    const hashBuffer = Buffer.from(hash, 'utf-8');
    const hmacBuffer = Buffer.from(hmacHeader, 'utf-8');

    if (hashBuffer.length !== hmacBuffer.length || !crypto.timingSafeEqual(hashBuffer, hmacBuffer)) {
      console.error(`Invalid Webhook Signature. Expected: ${hash}, Got: ${hmacHeader}`);
      return res.status(401).send("Invalid HMAC signature");
    }

    next();
  } catch (error) {
    console.error("Webhook Verification Error:", error);
    return res.status(401).send("Webhook verification failed");
  }
}