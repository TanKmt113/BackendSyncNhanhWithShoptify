import axios from "axios";
import { logger } from "../utils/logger";
import createShoptify from "../integrations/shopifyClient";
import { getConfig } from "./config.service";

/**
 * Cập nhật số lượng tồn kho trên Shopify dựa trên mã SKU (Barcode).
 * @param sku Mã SKU của sản phẩm.
 * @param newQuantity Số lượng tồn kho mới.
 * @returns true nếu cập nhật thành công, false nếu có lỗi.
 */
export async function updateInventoryByBarcode(sku: string, newQuantity: number) {
  const config = await getConfig();
  try {


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

    // Gửi request query đến Shopify
    const client = createShoptify(config)
    const queryRes = await client.post("/graphql.json", { query });

    // Kiểm tra lỗi trong phản hồi query
    if (queryRes.data.errors) {
      logger.error("Lỗi GraphQL Shopify (Query):", JSON.stringify(queryRes.data.errors, null, 2));
      return false;
    }

    const variantEdges = queryRes.data?.data?.productVariants?.edges || [];
    const locationEdges = queryRes.data?.data?.locations?.edges || [];

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
    const mutation = `
      mutation {
        inventorySetQuantities(input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId: "${inventoryItemId}",
              locationId: "${locationId}",
              quantity: ${newQuantity}
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

    // Gửi request mutation cập nhật tồn kho
    const mutationRes = await client.post("/graphql.json", { query: mutation });

    // Kiểm tra lỗi trong phản hồi mutation
    if (mutationRes.data.errors) {
      logger.error("Lỗi GraphQL Shopify (Mutation):", JSON.stringify(mutationRes.data.errors, null, 2));
      return false;
    }

    const result = mutationRes.data?.data?.inventorySetQuantities;

    // Kiểm tra kết quả trả về
    if (!result) {
      logger.error("Phản hồi không mong đợi từ Shopify:", JSON.stringify(mutationRes.data, null, 2));
      return false;
    }

    // Kiểm tra lỗi người dùng trả về từ Shopify (ví dụ: logic nghiệp vụ)
    if (result.userErrors.length > 0) {
      logger.error("Lỗi đồng bộ Shopify:", result.userErrors);
      return false;
    }

    logger.info(`Đã đồng bộ SKU ${sku}: Số lượng mới ${newQuantity}`);
    return true;

  } catch (error: any) {
    // Xử lý lỗi ngoại lệ (ví dụ: lỗi mạng, lỗi thư viện axios)
    if (axios.isAxiosError(error)) {
      logger.error("Lỗi Axios khi đồng bộ tồn kho:", error.response?.data || error.message);
    } else {
      logger.error("Lỗi khi đồng bộ tồn kho lên Shopify:", error);
    }
    return false;
  }
}

export async function getInventoryBySku(sku: string): Promise<number | null> {
  const config = await getConfig();
  try {
    const query = `
          {
            productVariants(first: 1, query: "sku:${sku}") {
              edges {
                node {
                  inventoryQuantity
                }
              }
            }
          }
        `;

    const client = createShoptify(config)
    const queryRes = await client.post("/graphql.json", { query });
    if (queryRes.data.errors) return null;

    const edges = queryRes.data?.data?.productVariants?.edges;
    if (edges && edges.length > 0) {
      return edges[0].node.inventoryQuantity;
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
    const query = `
      {
        productVariants(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              product {
                id
              }
            }
          }
        }
      }
    `;

    const client = createShoptify(config);
    const queryRes = await client.post("/graphql.json", { query });
    
    if (queryRes.data.errors) return null;

    const edges = queryRes.data?.data?.productVariants?.edges;
    if (edges && edges.length > 0) {
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
export async function updateOrderStatus(shopifyOrderId: number, status: string) {

  switch (status) {
    case 'Archived':
      return await updateOrderArchived(shopifyOrderId);
    case 'Fulfilled':
      return await updateOrderFulfilled(shopifyOrderId);
    case 'Canceled':
      return await updateOrderCanceled(shopifyOrderId);
    default:
      logger.info(`Trạng thái đơn hàng '${status}' không được hỗ trợ cập nhật lên Shopify.`);
      return true;
  }
}

async function updateOrderArchived(shopifyOrderId: number) {
  const config = await getConfig();
  try {
    // 1. Cố gắng cập nhật trạng thái Fulfilled trước (nếu chưa Fulfilled)
    // Điều này đảm bảo đơn hàng Archive là đơn hàng đã hoàn tất giao hàng
    await updateOrderFulfilled(shopifyOrderId);
    // 2. Sau đó thực hiện lưu trữ (Close order)
    const client = createShoptify(config)
    await client.post(`/orders/${shopifyOrderId}/close.json`);
    logger.info(`Đã lưu trữ (archive) đơn hàng ${shopifyOrderId} trên Shopify.`);
    return true;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error("Lỗi khi lưu trữ đơn hàng trên Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Lỗi khi lưu trữ đơn hàng trên Shopify:", error);
    }
    return false;
  }
}

async function updateOrderFulfilled(shopifyOrderId: number) {
  const config = await getConfig();
  try {
    // 1. Lấy danh sách các yêu cầu thực hiện đơn hàng (fulfillment orders) cho đơn hàng này.
    const client = createShoptify(config)
    const fulfillmentOrdersRes = await client.get(`/orders/${shopifyOrderId}/fulfillment_orders.json`);
    const fulfillmentOrders = fulfillmentOrdersRes.data.fulfillment_orders;

    if (!fulfillmentOrders || fulfillmentOrders.length === 0) {
      logger.warn(`Không tìm thấy yêu cầu thực hiện (fulfillment orders) cho đơn hàng ${shopifyOrderId}`);
      return false;
    }

    // Tìm đơn thực hiện nào đang ở trạng thái 'open' (mở)
    const openFulfillmentOrder = fulfillmentOrders.find((fo: any) => fo.status === 'open');

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
    // Xử lý lỗi
    if (axios.isAxiosError(error)) {
      logger.error("Lỗi khi cập nhật trạng thái đơn hàng (Fulfilled) trên Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Lỗi khi cập nhật trạng thái đơn hàng (Fulfilled) trên Shopify:", error);
    }
    return false;
  }
}

async function updateOrderCanceled(shopifyOrderId: number) {
  const config = await getConfig();
  try {
    const client = createShoptify(config)
    await client.post(`/orders/${shopifyOrderId}/cancel.json`);
    logger.info(`Đã hủy đơn hàng ${shopifyOrderId} trên Shopify.`);
    return true;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      // Shopify trả về lỗi 422 nếu đơn hàng đã bị hủy hoặc không thể hủy
      if (error.response?.status === 422) {
        logger.warn(`Đơn hàng ${shopifyOrderId} có thể đã được hủy trước đó hoặc không thể hủy: ${JSON.stringify(error.response.data)}`);
        return true;
      }
      logger.error("Lỗi khi hủy đơn hàng trên Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Lỗi khi hủy đơn hàng trên Shopify:", error);
    }
    return false;
  }
}

/**
 * Create a new product on Shopify with full details from Nhanh.vn
 * @param product Product object from database
 * @param nhanhData Full product data from Nhanh.vn API (optional, will fetch if not provided)
 * @returns true if successful, false otherwise
 */
export async function createProductOnShopify(product: any, nhanhData?: any): Promise<boolean> {
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
    let bodyHtml = productDetails?.description || productDetails?.content || "<p>Product from Nhanh.vn</p>";
    
    // Add product details to description
    if (productDetails?.content) {
      bodyHtml += `<br><br>${productDetails.content}`;
    }

    // Build images array
    const images: any[] = [];
    if (productDetails?.images?.avatar) {
      images.push({ src: productDetails.images.avatar });
    }
    if (productDetails?.images?.others && Array.isArray(productDetails.images.others)) {
      productDetails.images.others.forEach((img: string) => {
        images.push({ src: img });
      });
    }
    // Fallback to product.image from database
    if (images.length === 0 && product.image) {
      images.push({ src: product.image });
    }

    // Build variant with full info
    const variant: any = {
      sku: productDetails?.barcode || productDetails?.code || product.sku_nhanh,
      price: productDetails?.prices?.retail?.toString() || "0",
      compare_at_price: productDetails?.prices?.old?.toString() || undefined,
      cost: productDetails?.prices?.import?.toString() || undefined,
      inventory_management: "shopify",
      inventory_policy: "deny",
      inventory_quantity: productDetails?.inventory?.available || 0,
    };

    // Add shipping dimensions if available
    if (productDetails?.shipping) {
      if (productDetails.shipping.weight) {
        variant.weight = productDetails.shipping.weight;
        variant.weight_unit = "g"; // Nhanh.vn uses grams
      }
    }

    // Handle product variants (childs) if exists
    const variants: any[] = [];
    if (productDetails?.childs && Array.isArray(productDetails.childs) && productDetails.childs.length > 0) {
      // Product has variants
      productDetails.childs.forEach((child: any) => {
        const childVariant: any = {
          sku: child.barcode || child.code,
          price: child.prices?.retail?.toString() || "0",
          compare_at_price: child.prices?.old?.toString() || undefined,
          cost: child.prices?.import?.toString() || undefined,
          inventory_management: "shopify",
          inventory_policy: "deny",
          inventory_quantity: child.inventory?.available || 0,
        };

        // Add variant options from attributes
        if (child.attributes && Array.isArray(child.attributes)) {
          child.attributes.forEach((attr: any, index: number) => {
            childVariant[`option${index + 1}`] = attr.value;
          });
        }

        if (child.shipping?.weight) {
          childVariant.weight = child.shipping.weight;
          childVariant.weight_unit = "g";
        }

        variants.push(childVariant);
      });
    } else {
      // Single product, no variants
      variants.push(variant);
    }

    // Build product options from parent attributes
    const options: any[] = [];
    if (productDetails?.attributes && Array.isArray(productDetails.attributes)) {
      productDetails.attributes.forEach((attr: any) => {
        options.push({
          name: attr.name,
          values: [attr.value]
        });
      });
    }

    // Build final product payload
    const productPayload = {
      product: {
        title: productDetails?.name || product.name || product.sku_nhanh,
        body_html: bodyHtml,
        vendor: productDetails?.brand?.name || "Nhanh.vn",
        product_type: productDetails?.category?.name || productDetails?.internalCategory?.name || "Imported",
        status: "draft", // Set to draft for user review before publishing
        tags: [
          productDetails?.category?.name,
          productDetails?.brand?.name,
          productDetails?.type?.name
        ].filter(Boolean).join(", "),
        variants: variants,
        images: images.length > 0 ? images : undefined,
        options: options.length > 0 ? options : undefined,
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
    console.log("Creating product on Shopify with payload:", JSON.stringify(productPayload, null, 2));
    const response = await client.post("/products.json", productPayload);

    if (response.data?.product?.id) {
      logger.info(`Successfully created product ${productDetails?.name || product.name} on Shopify with ID: ${response.data.product.id}`);

      // Update product in database with shopify SKU
      if (product.update) {
        await product.update({
          sku_shopify: productDetails?.barcode || productDetails?.code || product.sku_nhanh
        });
      }

      return true;
    }

    return false;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error("Error creating product on Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Error creating product on Shopify:", error);
    }
    return false;
  }
}

