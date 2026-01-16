// interfaces/store-setting.interface.ts

export interface StoreSettingAttributes {
  id: number;
  shop_name: string;

  // Shopify
  shopify_admin_api?: string | null;
  shopify_api_key?: string | null;
  shopify_api_secret?: string | null;
  shopify_webhook_secret?: string | null;
  shopify_api_version?: string | null;

  // Nhanh.vn
  nhanh_app_id?: string | null;
  nhanh_app_token?: string | null;
  nhanh_business_id?: string | null;
  nhanh_secret_key?: string | null;
  nhanh_api_url?: string | null;
  nhanh_return_link?: string | null;
  nhanh_webhook?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}
