// Shopify Types and Interfaces

/**
 * Product variant interface for Shopify
 */
export interface ShopifyVariant {
  id?: number | string;
  sku: string;
  price: string;
  compare_at_price?: string;
  cost?: string;
  inventory_management?: string;
  inventory_policy?: string;
  inventory_quantity?: number;
  option1?: string;
  option2?: string;
  option3?: string;
  weight?: number;
  weight_unit?: string;
}

/**
 * Product option interface for Shopify
 */
export interface ShopifyProductOption {
  id?: string;
  name: string;
  values: string[];
  position?: number;
}

/**
 * Product image interface for Shopify
 */
export interface ShopifyImage {
  src: string;
  alt?: string;
}

/**
 * Metafield interface for Shopify
 */
export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

/**
 * Product payload for creating/updating products on Shopify
 */
export interface ShopifyProductPayload {
  product: {
    id?: number | string;
    title: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    status?: 'active' | 'draft' | 'archived';
    tags?: string;
    variants?: ShopifyVariant[];
    images?: ShopifyImage[];
    options?: ShopifyProductOption[];
    metafields?: ShopifyMetafield[];
  };
}

/**
 * GraphQL query result structure
 */
export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; [key: string]: any }>;
}

/**
 * Product variant edge structure from GraphQL
 */
export interface ProductVariantEdge {
  node: {
    id: string;
    inventoryQuantity?: number;
    inventoryItem?: {
      id: string;
    };
    image?: {
      url: string;
      altText?: string;
    };
    product?: {
      id: string;
      options?: ShopifyProductOption[];
      images?: {
        edges: Array<{
          node: {
            url: string;
            altText?: string;
          };
        }>;
      };
    };
  };
}

/**
 * Location edge structure from GraphQL
 */
export interface LocationEdge {
  node: {
    id: string;
    name?: string;
  };
}

/**
 * Fulfillment order structure
 */
export interface FulfillmentOrder {
  id: number | string;
  status: string;
  [key: string]: any;
}

/**
 * Inventory adjustment result
 */
export interface InventorySetQuantitiesResult {
  inventoryAdjustmentGroup?: {
    reason: string;
    changes: Array<{
      name: string;
      delta: number;
    }>;
  };
  userErrors: Array<{
    field?: string[];
    message: string;
  }>;
}

/**
 * Order status enum
 */
export enum ShopifyOrderStatus {
  ARCHIVED = 'Archived',
  FULFILLED = 'Fulfilled',
  CANCELED = 'Canceled'
}

/**
 * GraphQL query variables
 */
export interface GraphQLVariables {
  [key: string]: any;
}

/**
 * Common API error structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
}
