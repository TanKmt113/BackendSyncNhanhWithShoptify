// Nhanh.vn Types and Interfaces

/**
 * Nhanh product prices structure
 */
export interface NhanhPrices {
  retail?: number;
  old?: number;
  import?: number;
  [key: string]: any;
}

/**
 * Nhanh product inventory structure
 */
export interface NhanhInventory {
  available: number;
  [key: string]: any;
}

/**
 * Nhanh product shipping information
 */
export interface NhanhShipping {
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}

/**
 * Nhanh product images structure
 */
export interface NhanhImages {
  avatar?: string;
  others?: string[];
}

/**
 * Nhanh product attribute
 */
export interface NhanhAttribute {
  name: string;
  value: string;
  [key: string]: any;
}

/**
 * Nhanh category structure
 */
export interface NhanhCategory {
  id?: number;
  name?: string;
  [key: string]: any;
}

/**
 * Nhanh brand structure
 */
export interface NhanhBrand {
  id?: number;
  name?: string;
  [key: string]: any;
}

/**
 * Nhanh product type structure
 */
export interface NhanhProductType {
  id?: number;
  name?: string;
  [key: string]: any;
}

/**
 * Nhanh product child/variant structure
 */
export interface NhanhProductChild {
  id?: number;
  code?: string;
  barcode?: string;
  name?: string;
  prices?: NhanhPrices;
  inventory?: NhanhInventory;
  shipping?: NhanhShipping;
  attributes?: NhanhAttribute[];
  [key: string]: any;
}

/**
 * Nhanh product details structure
 */
export interface NhanhProductDetails {
  id?: number;
  code?: string;
  barcode?: string;
  name?: string;
  description?: string;
  content?: string;
  prices?: NhanhPrices;
  inventory?: NhanhInventory;
  shipping?: NhanhShipping;
  images?: NhanhImages;
  attributes?: NhanhAttribute[];
  category?: NhanhCategory;
  internalCategory?: NhanhCategory;
  brand?: NhanhBrand;
  type?: NhanhProductType;
  childs?: NhanhProductChild[];
  [key: string]: any;
}

/**
 * Nhanh API response structure
 */
export interface NhanhApiResponse<T = any> {
  code: number;
  messages?: string[];
  data?: T;
  [key: string]: any;
}

/**
 * Nhanh paginator structure
 */
export interface NhanhPaginator {
  size: number;
  next?: string | null;
  [key: string]: any;
}

/**
 * Nhanh product list payload
 */
export interface NhanhProductListPayload {
  paginator?: NhanhPaginator;
  filters?: {
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Nhanh order structure
 */
export interface NhanhOrder {
  id: string;
  code?: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: string;
  products?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Nhanh webhook data structure
 */
export interface NhanhWebhookData {
  type: string;
  data: any;
  timestamp?: number;
  [key: string]: any;
}
