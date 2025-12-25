export function errorHandler(req: any, res: any, next: any) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody; // rawBody should be set by a body parser middleware
};