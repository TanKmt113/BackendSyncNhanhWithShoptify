import axios, { AxiosInstance } from "axios";
import { logger } from "./logger";
import { GraphQLResponse, ApiError } from "../types/shopify.types";

/**
 * Generic error handler for API calls
 * @param error The error object
 * @param context Context message for logging
 * @returns false to indicate failure
 */
export function handleApiError(error: any, context: string): false {
  if (axios.isAxiosError(error)) {
    logger.error(`${context}:`, error.response?.data || error.message);
  } else {
    logger.error(`${context}:`, error);
  }
  return false;
}

/**
 * Execute a GraphQL query/mutation on Shopify
 * @param client Axios client instance
 * @param query GraphQL query string
 * @returns GraphQL response or null on error
 */
export async function executeGraphQL<T = any>(
  client: AxiosInstance,
  query: string
): Promise<GraphQLResponse<T> | null> {
  try {
    const response = await client.post("/graphql.json", { query });
    
    if (response.data.errors) {
      logger.error("GraphQL Errors:", JSON.stringify(response.data.errors, null, 2));
      return null;
    }
    
    return response.data;
  } catch (error) {
    handleApiError(error, "GraphQL execution error");
    return null;
  }
}

/**
 * Extract product variant edges from GraphQL response
 * @param response GraphQL response
 * @returns Array of variant edges or empty array
 */
export function extractVariantEdges(response: GraphQLResponse | null): any[] {
  return response?.data?.productVariants?.edges || [];
}

/**
 * Extract location edges from GraphQL response
 * @param response GraphQL response
 * @returns Array of location edges or empty array
 */
export function extractLocationEdges(response: GraphQLResponse | null): any[] {
  return response?.data?.locations?.edges || [];
}

/**
 * Check if a 422 status error indicates resource already in desired state
 * @param error Axios error
 * @param resourceType Type of resource (e.g., "order")
 * @param desiredState Desired state (e.g., "canceled")
 * @returns true if resource is already in desired state
 */
export function isResourceAlreadyInState(
  error: any,
  resourceType: string = "resource",
  desiredState: string = "desired state"
): boolean {
  if (axios.isAxiosError(error) && error.response?.status === 422) {
    logger.warn(
      `${resourceType} may already be in ${desiredState} or cannot be changed: ${JSON.stringify(error.response.data)}`
    );
    return true;
  }
  return false;
}

/**
 * Build GraphQL query to find product variant by SKU
 * @param sku Product SKU
 * @param additionalFields Additional fields to include in the query
 * @returns GraphQL query string
 */
export function buildProductVariantQuery(sku: string, additionalFields: string = ""): string {
  return `
    {
      productVariants(first: 1, query: "sku:${sku}") {
        edges {
          node {
            id
            ${additionalFields}
          }
        }
      }
    }
  `;
}

/**
 * Build GraphQL query to get locations
 * @param first Number of locations to retrieve
 * @returns GraphQL query string
 */
export function buildLocationsQuery(first: number = 1): string {
  return `
    {
      locations(first: ${first}) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
}

/**
 * Build GraphQL mutation for inventory quantity update
 * @param inventoryItemId Inventory item ID
 * @param locationId Location ID
 * @param quantity New quantity
 * @returns GraphQL mutation string
 */
export function buildInventorySetQuantitiesMutation(
  inventoryItemId: string,
  locationId: string,
  quantity: number
): string {
  return `
    mutation {
      inventorySetQuantities(input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId: "${inventoryItemId}",
            locationId: "${locationId}",
            quantity: ${quantity}
          }
        ]
      }) {
        inventoryAdjustmentGroup {
          reason
          changes {
            name
            delta
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
}

/**
 * Extract numeric ID from Shopify GraphQL ID
 * @param gid GraphQL global ID (e.g., "gid://shopify/Product/1234567890")
 * @returns Numeric ID as string
 */
export function extractNumericId(gid: string): string {
  return gid.split('/').pop() || '';
}

/**
 * Validate API response and check for user errors
 * @param response API response
 * @param dataPath Path to data in response (e.g., "inventorySetQuantities")
 * @returns true if valid, false otherwise
 */
export function validateApiResponse(response: any, dataPath?: string): boolean {
  if (!response) {
    logger.error("Empty response from API");
    return false;
  }
  
  if (dataPath) {
    const data = getNestedProperty(response, dataPath);
    if (!data) {
      logger.error(`Unexpected response structure. Missing: ${dataPath}`);
      return false;
    }
    
    if (data.userErrors && data.userErrors.length > 0) {
      logger.error("API user errors:", data.userErrors);
      return false;
    }
  }
  
  return true;
}

/**
 * Safely get nested property from object
 * @param obj Object to traverse
 * @param path Dot-separated path (e.g., "data.inventorySetQuantities")
 * @returns Property value or undefined
 */
export function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
}

/**
 * Retry async operation with exponential backoff
 * @param operation Async operation to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Result of operation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        handleApiError(error, `Operation failed after ${maxRetries} attempts`);
        return null;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Operation failed, retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

/**
 * Build product description HTML from Nhanh data
 * @param description Short description
 * @param content Full content/details
 * @returns HTML string
 */
export function buildProductDescription(description?: string, content?: string): string {
  let html = description || content || "<p>Product from Nhanh.vn</p>";
  
  if (description && content && description !== content) {
    html += `<br><br>${content}`;
  }
  
  return html;
}

/**
 * Build product tags string from multiple sources
 * @param sources Array of tag sources (category, brand, etc.)
 * @returns Comma-separated tags string
 */
export function buildProductTags(sources: (string | undefined | null)[]): string {
  return sources.filter(Boolean).join(", ");
}
