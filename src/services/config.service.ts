import { StoreSetting } from "../models";
import { encrypt, decrypt } from "../utils/crypto";

// Cache config in memory to avoid hitting DB every request
let cachedConfig: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1 minute

export const getConfig = async () => {
  const now = Date.now();
  if (cachedConfig && (now - lastFetchTime < CACHE_TTL)) {
    return cachedConfig;
  }

  // Luôn lấy bản ghi đầu tiên, không quan tâm tên là gì
  let setting = await StoreSetting.findOne();
  
  if (!setting) {
      // Fallback to env or return empty object
      return {
          shopify_webhook_secret: process.env.SHOPIFY_WEBHOOK_SECRET,
          shopify_admin_api: process.env.SHOPIFY_ADMIN_API,
          // ... return raw envs
          nhanh_app_id: process.env.NHANH_APP_ID,
          nhanh_business_id: process.env.NHANH_BUSINESS_ID,
          nhanh_api_url: process.env.NHANH_API_URL,
          // Secrets not decrypted because they are raw in env
          nhanh_secret_key: process.env.NHANH_SECRET_KEY
      };
  }

  // Decrypt secrets
  const config = {
      ...setting.toJSON(),
      shopify_api_secret: decrypt(setting.shopify_api_secret),
      shopify_webhook_secret: decrypt(setting.shopify_webhook_secret),
      nhanh_app_token: decrypt(setting.nhanh_app_token),
      nhanh_secret_key: decrypt(setting.nhanh_secret_key)
  };

  cachedConfig = config;
  lastFetchTime = now;
  return config;
};

export const updateConfig = async (data: any) => {
    // Encrypt sensitive fields before saving
    const payload = { ...data };
    
    if (payload.shopify_api_secret) payload.shopify_api_secret = encrypt(payload.shopify_api_secret);
    if (payload.shopify_webhook_secret) payload.shopify_webhook_secret = encrypt(payload.shopify_webhook_secret);
    if (payload.nhanh_app_token) payload.nhanh_app_token = encrypt(payload.nhanh_app_token);
    if (payload.nhanh_secret_key) payload.nhanh_secret_key = encrypt(payload.nhanh_secret_key);
    
    // Tìm bản ghi đầu tiên
    let setting = await StoreSetting.findOne();

    if (setting) {
        // Nếu đã có -> Update
        await setting.update(payload);
    } else {
        // Nếu chưa có -> Create mới
        // Đảm bảo shop_name có giá trị nếu payload không gửi lên (dù logic frontend nên gửi)
        if (!payload.shop_name) payload.shop_name = "default";
        await StoreSetting.create(payload);
    }
    
    // Invalidate cache
    cachedConfig = null;
    return await getConfig(); // Return decrypted updated config
};
