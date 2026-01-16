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

