import { logger } from "../utils/logger";
import createShoptify from "../integrations/shopifyClient";
import { getConfig } from "./config.service";
import {
  ShopifyOrderStatus,
  FulfillmentOrder,
  ShopifyProductPayload,
  ProductVariantEdge,
  LocationEdge
} from "../types/shopify.types";
import { NhanhProductDetails, NhanhProductChild } from "../types/nhanh.types";
import {
  handleApiError,
  executeGraphQL,
  extractVariantEdges,
  extractLocationEdges,
  isResourceAlreadyInState,
  buildInventorySetQuantitiesMutation,
  buildProductVariantQuery,
  extractNumericId,
  validateApiResponse,
  buildProductDescription,
  buildProductTags
} from "../utils/apiHelper";

/**
 * Kiểm tra và cập nhật trạng thái sản phẩm về "unlisted" nếu tất cả biến thể đều hết hàng
 * @param client Shopify client instance
 * @param variantId ID của biến thể GraphQL
 * @returns true nếu thành công hoặc không cần cập nhật, false nếu có lỗi
 */
async function checkAndUpdateProductStatusIfOutOfStock(client: any, variantId: string): Promise<boolean> {
  try {
    // Lấy Product ID và tất cả variants từ variant
    const getProductQuery = `
      {
        productVariant(id: "${variantId}") {
          product {
            id
            variants(first: 100) {
              edges {
                node {
                  id
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    `;

    const productQueryRes = await executeGraphQL<{
      productVariant: {
        product: {
          id: string;
          variants: { edges: Array<{ node: { id: string; inventoryQuantity: number } }> };
        };
      };
    }>(client, getProductQuery);

    if (!productQueryRes || !productQueryRes.data) return true;

    const product = productQueryRes.data.productVariant.product;
    const allVariants = product.variants.edges;

    // Kiểm tra xem tất cả biến thể có inventory < 1 không
    const allVariantsOutOfStock = allVariants.every(edge =>
      (edge.node.inventoryQuantity || 0) < 1
    );

    if (allVariantsOutOfStock) {
      // Chuyển trạng thái sản phẩm về unlisted nếu tất cả biến thể đều hết hàng
      const numericProductId = extractNumericId(product.id);

      await client.put(`/products/${numericProductId}.json`, {
        product: {
          status: "unlisted"
        }
      });
      logger.info(`Đã chuyển sản phẩm (ID: ${numericProductId}) về trạng thái unlisted do tất cả biến thể hết hàng`);
    }

    return true;
  } catch (error: any) {
    return handleApiError(error, "Lỗi khi kiểm tra và cập nhật trạng thái sản phẩm");
  }
}

async function updateOrderArchived(shopifyOrderId: number): Promise<boolean> {
  const config = await getConfig();
  try {
    // 1. Cố gắng cập nhật trạng thái Fulfilled trước (nếu chưa Fulfilled)
    // Điều này đảm bảo đơn hàng Archive là đơn hàng đã hoàn tất giao hàng
    await updateOrderFulfilled(shopifyOrderId);
    // 2. Sau đó thực hiện lưu trữ (Close order)
    const client = createShoptify(config);
    await client.post(`/orders/${shopifyOrderId}/close.json`);
    logger.info(`Đã lưu trữ (archive) đơn hàng ${shopifyOrderId} trên Shopify.`);
    return true;
  } catch (error: any) {
    return handleApiError(error, "Lỗi khi lưu trữ đơn hàng trên Shopify");
  }
}


async function updateOrderFulfilled(shopifyOrderId: number): Promise<boolean> {
  const config = await getConfig();
  try {
    // 1. Lấy danh sách các yêu cầu thực hiện đơn hàng (fulfillment orders) cho đơn hàng này.
    const client = createShoptify(config);
    const fulfillmentOrdersRes = await client.get(`/orders/${shopifyOrderId}/fulfillment_orders.json`);
    const fulfillmentOrders: FulfillmentOrder[] = fulfillmentOrdersRes.data.fulfillment_orders;

    if (!fulfillmentOrders || fulfillmentOrders.length === 0) {
      logger.warn(`Không tìm thấy yêu cầu thực hiện (fulfillment orders) cho đơn hàng ${shopifyOrderId}`);
      return false;
    }

    // Tìm đơn thực hiện nào đang ở trạng thái 'open' (mở)
    const openFulfillmentOrder = fulfillmentOrders.find(fo => fo.status === 'open');

    // Nếu không còn đơn nào mở (đã hoàn thành hoặc đã hủy)
    if (!openFulfillmentOrder) {
      logger.info(`Đơn hàng ${shopifyOrderId} đã được giao hoặc không có yêu cầu thực hiện nào đang mở.`);
      return true;
    }

    // 2. Tạo payload để thực hiện fulfillment (đánh dấu đã giao).
    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: openFulfillmentOrder.id
          }
        ]
      }
    };

    // Gửi request tạo fulfillment
    const fulfillRes = await client.post("/fulfillments.json", fulfillmentPayload);
    logger.info(`Đã cập nhật giao hàng thành công cho đơn hàng ${shopifyOrderId}. ID Fulfillment: ${fulfillRes.data.fulfillment.id}`);

    return true;

  } catch (error: any) {
    return handleApiError(error, "Lỗi khi cập nhật trạng thái đơn hàng (Fulfilled) trên Shopify");
  }
}


async function updateOrderCanceled(shopifyOrderId: number): Promise<boolean> {
  const config = await getConfig();
  try {
    const client = createShoptify(config);
    await client.post(`/orders/${shopifyOrderId}/cancel.json`);
    logger.info(`Đã hủy đơn hàng ${shopifyOrderId} trên Shopify.`);
    return true;
  } catch (error: any) {
    // Shopify trả về lỗi 422 nếu đơn hàng đã bị hủy hoặc không thể hủy
    if (isResourceAlreadyInState(error, `Đơn hàng ${shopifyOrderId}`, "canceled")) {
      return true;
    }
    return handleApiError(error, "Lỗi khi hủy đơn hàng trên Shopify");
  }
}



/**
 * Cập nhật số lượng tồn kho trên Shopify dựa trên mã SKU (Barcode).
 * @param sku Mã SKU của sản phẩm.
 * @param newQuantity Số lượng tồn kho mới.
 * @returns true nếu cập nhật thành công, false nếu có lỗi.
 */
export async function updateInventoryByBarcode(sku: string, newQuantity: number): Promise<boolean> {
  const config = await getConfig();
  try {
    const client = createShoptify(config);

    // 1. Truy vấn GraphQL để lấy ID của InventoryItem từ SKU và Location ID của cửa hàng.
    const query = `
      {
        productVariants(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              inventoryItem {
                id
              }
            }
          }
        }
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const queryRes = await executeGraphQL<{
      productVariants: { edges: ProductVariantEdge[] };
      locations: { edges: LocationEdge[] };
    }>(client, query);

    if (!queryRes) return false;

    const variantEdges = extractVariantEdges(queryRes);
    const locationEdges = extractLocationEdges(queryRes);

    // Nếu không tìm thấy biến thể sản phẩm với SKU tương ứng
    if (variantEdges.length === 0) {
      logger.info(`Đồng bộ tồn kho: Không tìm thấy mã SKU ${sku} trên Shopify.`);
      return false;
    }

    // Nếu cửa hàng không có địa điểm kho (location)
    if (locationEdges.length === 0) {
      logger.error("Không tìm thấy địa điểm kho (Location) nào trên cửa hàng Shopify.");
      return false;
    }

    // Lấy ID của InventoryItem và Location
    const inventoryItemId = variantEdges[0].node.inventoryItem.id;
    const locationId = locationEdges[0].node.id;

    // 2. Tạo mutation GraphQL để cập nhật số lượng tồn kho.
    const mutation = buildInventorySetQuantitiesMutation(inventoryItemId, locationId, newQuantity);

    // Gửi request mutation cập nhật tồn kho
    const mutationRes = await executeGraphQL(client, mutation);

    if (!mutationRes) return false;

    // Kiểm tra kết quả trả về
    if (!validateApiResponse(mutationRes, 'data.inventorySetQuantities')) {
      return false;
    }

    logger.info(`Đã đồng bộ SKU ${sku}: Số lượng mới ${newQuantity}`);

    // Nếu số lượng < 1, kiểm tra và cập nhật trạng thái sản phẩm nếu cần
    if (newQuantity < 1) {
      const variantId = variantEdges[0].node.id;
      await checkAndUpdateProductStatusIfOutOfStock(client, variantId);
    }

    return true;

  } catch (error: any) {
    return handleApiError(error, "Lỗi khi đồng bộ tồn kho lên Shopify");
  }
}

export async function getInventoryBySku(sku: string): Promise<number | null> {
  const config = await getConfig();
  try {
    const query = buildProductVariantQuery(sku, "inventoryQuantity");

    const client = createShoptify(config);
    const queryRes = await executeGraphQL<{
      productVariants: { edges: ProductVariantEdge[] };
    }>(client, query);

    if (!queryRes) return null;

    const edges = extractVariantEdges(queryRes);
    if (edges.length > 0) {
      return edges[0].node.inventoryQuantity || 0;
    }
    return null;
  } catch (error) {
    logger.error(`Error getting inventory for SKU ${sku}:`, error);
    return null;
  }
}

/**
 * Check if a product exists on Shopify by SKU
 * @param sku The SKU to search for
 * @returns Product variant ID if exists, null otherwise
 */
export async function checkProductExistsBySku(sku: string): Promise<string | null> {
  const config = await getConfig();
  try {
    const query = buildProductVariantQuery(sku, `
      product {
        id
      }
    `);

    const client = createShoptify(config);
    const queryRes = await executeGraphQL<{
      productVariants: { edges: ProductVariantEdge[] };
    }>(client, query);

    if (!queryRes) return null;

    const edges = extractVariantEdges(queryRes);
    if (edges.length > 0) {
      return edges[0].node.id;
    }
    return null;
  } catch (error) {
    logger.error(`Error checking product exists for SKU ${sku}:`, error);
    return null;
  }
}

/**
 * Cập nhật trạng thái đơn hàng trên Shopify (Cụ thể là Fulfillment).
 * @param shopifyOrderId ID của đơn hàng trên Shopify.
 * @param status Trạng thái mới từ hệ thống bên ngoài (ví dụ: Nhanh.vn).
 * @returns true nếu cập nhật thành công hoặc không cần cập nhật, false nếu lỗi.
 */
export async function updateOrderStatus(shopifyOrderId: number, status: string): Promise<boolean> {
  switch (status) {
    case ShopifyOrderStatus.ARCHIVED:
      return await updateOrderArchived(shopifyOrderId);
    case ShopifyOrderStatus.FULFILLED:
      return await updateOrderFulfilled(shopifyOrderId);
    case ShopifyOrderStatus.CANCELED:
      return await updateOrderCanceled(shopifyOrderId);
    default:
      logger.info(`Trạng thái đơn hàng '${status}' không được hỗ trợ cập nhật lên Shopify.`);
      return true;
  }
}


/**
 * Create a new product on Shopify with full details from Nhanh.vn
 * @param product Product object from database
 * @param nhanhData Full product data from Nhanh.vn API (optional, will fetch if not provided)
 * @returns true if successful, false otherwise
 */
export async function createProductOnShopify(product: any, nhanhData?: NhanhProductDetails): Promise<boolean> {
  const config = await getConfig();
  try {
    const client = createShoptify(config);

    // If nhanhData is not provided, fetch it from Nhanh API
    let productDetails = nhanhData;
    if (!productDetails && product.nhanh_id) {
      const { getByIdProduct } = await import("./nhanh.service");
      const response = await getByIdProduct(parseInt(product.nhanh_id));
      productDetails = response?.data;
    }

    // Build description from Nhanh data
    const bodyHtml = buildProductDescription(productDetails?.description, productDetails?.content);

    // Build images array
    const { buildProductImages, buildVariantsAndOptions, buildProductOptions } = await import("../utils/productHelper");
    const images = buildProductImages(productDetails, product.image);

    // Build variants and options
    const { variants, optionsMap } = buildVariantsAndOptions(productDetails || {
      barcode: product.sku_nhanh,
      code: product.sku_nhanh,
      name: product.name,
      inventory: { available: 0 }
    });

    const options = buildProductOptions(optionsMap);

    // Build product payload
    const productPayload: ShopifyProductPayload = {
      product: {
        title: productDetails?.name || product.name || product.sku_nhanh,
        body_html: bodyHtml,
        vendor: productDetails?.brand?.name || "Nhanh.vn",
        product_type: productDetails?.category?.name || productDetails?.internalCategory?.name || "Imported",
        status: "draft", // Set to draft for user review before publishing
        tags: buildProductTags([
          productDetails?.category?.name,
          productDetails?.brand?.name,
          productDetails?.type?.name
        ]),
        variants,
        ...(images.length > 0 && { images }),
        ...(options.length > 0 && { options }),
        metafields: [
          {
            namespace: "nhanh",
            key: "product_id",
            value: productDetails?.id?.toString() || product.nhanh_id,
            type: "single_line_text_field"
          },
          {
            namespace: "nhanh",
            key: "product_code",
            value: productDetails?.code || product.sku_nhanh,
            type: "single_line_text_field"
          }
        ]
      }
    };

    const response = await client.post("/products.json", productPayload);
    if (response.data?.product?.id) {
      logger.info(`Successfully created product ${productDetails?.name || product.name} on Shopify with ID: ${response.data.product.id}`);
      if (product.update) {
        await product.update({
          sku_shopify: productDetails?.barcode || productDetails?.code || product.sku_nhanh
        });
      }
      return true;
    }
    return false;
  } catch (error: any) {
    return handleApiError(error, "Error creating product on Shopify");
  }
}

/**
 * Add a new variant to an existing product on Shopify
 * @param parentBarcode Barcode of parent product to find on Shopify
 * @param variantData Variant data from Nhanh.vn
 * @returns true if successful, false otherwise
 */
export async function addVariantToProduct(parentBarcode: string, variantData: NhanhProductChild): Promise<boolean> {
  const config = await getConfig();
  try {
    const client = createShoptify(config);

    // 1. Find parent product by barcode and get full product details
    const query = buildProductVariantQuery(parentBarcode, `
      product {
        id
        options {
          id
          name
          values
          position
        }
      }
    `);

    const queryRes = await executeGraphQL<{
      productVariants: { edges: ProductVariantEdge[] };
    }>(client, query);

    if (!queryRes) {
      logger.error(`Product with barcode ${parentBarcode} not found on Shopify`);
      return false;
    }

    const edges = extractVariantEdges(queryRes);
    if (edges.length === 0) {
      logger.error(`Product with barcode ${parentBarcode} not found on Shopify`);
      return false;
    }

    const productData = edges[0].node.product;
    const productId = productData!.id;

    // Extract numeric ID from GraphQL ID
    const numericProductId = extractNumericId(productId);

    // 2. Get product details via REST API to update options if needed
    const productRes = await client.get(`/products/${numericProductId}.json`);
    const product = productRes.data.product;

    // 3. Build option mapping: match Nhanh attributes with Shopify options by NAME
    const variantAttributes = variantData.attributes || [];

    if (variantAttributes.length === 0) {
      logger.error("Variant data has no attributes");
      return false;
    }

    // Create a map of existing option names to their positions
    const existingOptionsMap = new Map<string, number>();
    product.options.forEach((opt: any, index: number) => {
      existingOptionsMap.set(opt.name, index);
    });

    // Determine which options need to be added and build the final options array
    const finalOptions = [...product.options];
    const attributeToOptionPosition = new Map<string, number>();

    variantAttributes.forEach(attr => {
      const existingPosition = existingOptionsMap.get(attr.name);

      if (existingPosition !== undefined) {
        // Option already exists, use its position
        attributeToOptionPosition.set(attr.name, existingPosition);

        // Add value if not already present
        if (!finalOptions[existingPosition].values.includes(attr.value)) {
          finalOptions[existingPosition].values.push(attr.value);
        }
      } else {
        // Option doesn't exist, add it
        const newPosition = finalOptions.length;
        finalOptions.push({
          name: attr.name,
          values: [attr.value]
        });
        existingOptionsMap.set(attr.name, newPosition);
        attributeToOptionPosition.set(attr.name, newPosition);
      }
    });

    // 4. Update product options if they changed
    const optionsChanged = finalOptions.length !== product.options.length ||
      finalOptions.some((opt: any, i: number) => {
        const original = product.options[i];
        return !original || opt.name !== original.name ||
          opt.values.length !== original.values.length ||
          opt.values.some((v: string) => !original.values.includes(v));
      });

    if (optionsChanged) {
      const newOptionsCount = finalOptions.length - product.options.length;

      if (newOptionsCount > 0) {
        logger.info(`Adding ${newOptionsCount} new option(s) to product ${numericProductId}`);

        // Build updated variants array with default values for new options
        const existingVariants = product.variants || [];
        const updatedVariants = existingVariants.map((variant: any) => {
          const updatedVariant: any = {
            id: variant.id,
            option1: variant.option1,
            option2: variant.option2,
            option3: variant.option3
          };

          // Add "Default" value for new options
          for (let i = product.options.length; i < finalOptions.length; i++) {
            const optionKey = `option${i + 1}`;
            updatedVariant[optionKey] = "Default";
          }

          return updatedVariant;
        });

        // Update product with new options AND updated variants in one request
        try {
          await client.put(`/products/${numericProductId}.json`, {
            product: {
              id: numericProductId,
              options: finalOptions,
              variants: updatedVariants
            }
          });
          logger.info(`Updated product options and variants for product ${numericProductId}`);
        } catch (err: any) {
          return handleApiError(err, "Failed to update product options and variants");
        }
      } else {
        // Just update options (no new options added, just values changed)
        try {
          await client.put(`/products/${numericProductId}.json`, {
            product: {
              id: numericProductId,
              options: finalOptions
            }
          });
          logger.info(`Updated product options for product ${numericProductId}`);
        } catch (err: any) {
          return handleApiError(err, "Failed to update product options");
        }
      }
    }

    // 5. Build variant payload with correct option mapping
    const { buildShopifyVariant } = await import("../utils/productHelper");
    const variantPayload = buildShopifyVariant(variantData);

    // Map attributes to correct option positions
    variantAttributes.forEach(attr => {
      const position = attributeToOptionPosition.get(attr.name);
      if (position !== undefined) {
        if (position === 0) variantPayload.option1 = attr.value;
        else if (position === 1) variantPayload.option2 = attr.value;
        else if (position === 2) variantPayload.option3 = attr.value;
      }
    });

    logger.info(`Adding variant with options:`, JSON.stringify({
      option1: variantPayload.option1,
      option2: variantPayload.option2,
      option3: variantPayload.option3
    }));

    // 6. Add variant to product using REST API
    const response = await client.post(`/products/${numericProductId}/variants.json`, {
      variant: variantPayload
    });

    if (response.data?.variant?.id) {
      logger.info(`Successfully added variant ${variantData.name} to product ${numericProductId}`);
      return true;
    }

    return false;
  } catch (error: any) {
    return handleApiError(error, "Error adding variant to product on Shopify");
  }
}