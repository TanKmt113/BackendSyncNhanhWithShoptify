import createNhanhClient from "../integrations/nhanhClient";
import { logger } from "../utils/logger";
import { getConfig, updateConfig } from "./config.service";
import {
  NhanhApiResponse,
  NhanhProductListPayload,
  NhanhProductDetails,
  NhanhPaginator
} from "../types/nhanh.types";

/**
 * Lấy URL cài đặt ứng dụng Nhanh.vn (OAuth).
 * @returns Chuỗi URL để người dùng thực hiện kết nối.
 */
export async function getInstallUrl(): Promise<string> {
  const config = await getConfig();
  const returnLink = config.nhanh_return_link;
  const appId = config.nhanh_app_id;
  const version = '3.0';
  return `https://nhanh.vn/oauth?version=${version}&appId=${appId}&returnLink=${returnLink}`;
}

/**
 * Đổi mã Access Code lấy Access Token từ Nhanh.vn.
 * @param accessCode Mã code nhận được sau khi người dùng đồng ý kết nối.
 * @param req Đối tượng request của Express để lưu session.
 * @returns Response data nếu thành công (bao gồm accessToken, businessId, etc.), ngược lại trả về null.
 */
export async function getCodeToken(accessCode: string) {
  const config = await getConfig();
  let data = {
    "accessCode": accessCode,
    "secretKey": config.nhanh_secret_key
  };

  try {
    const client = createNhanhClient(config);
    const response = await client.post(`/app/getaccesstoken?appId=${config.nhanh_app_id}`, data);

    if (response.data?.code === 1 && response.data?.data) {
      const { accessToken, businessId } = response.data.data;

      // Lưu accessToken và businessId vào database
      await updateConfig({
        nhanh_app_token: accessToken,
        nhanh_business_id: businessId.toString()
      });

      logger.info(`Đã lưu Access Token và Business ID (${businessId}) vào database thành công.`);

      return response.data.data;
    }

    logger.error("Response từ Nhanh.vn không hợp lệ:", response.data);
    return null;
  } catch (error) {
    logger.error("Lỗi khi lấy Access Token Nhanh.vn:", error);
    return null;
  }
}

/**
 * Lấy danh sách sản phẩm từ Nhanh.vn.
 * @param payload Dữ liệu gửi đi (bao gồm paginator, filters...).
 * @returns Dữ liệu danh sách sản phẩm.
 */
export async function getProducts(payload: NhanhProductListPayload = {}): Promise<NhanhApiResponse | null> {
  const config = await getConfig();
  try {
    const client = createNhanhClient(config);
    const data = {
      ...payload
    };
    const url = `/product/list?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`;
    const response = await client.post(url, data);
    logger.info(`Lấy danh sách sản phẩm từ Nhanh.vn thành công (Payload: ${JSON.stringify(payload)}).`);
    return response.data;
  } catch (error) {
    logger.error("Lỗi khi lấy danh sách sản phẩm từ Nhanh.vn:", error);
    return null;
  }
}

/**
 * Lấy toàn bộ danh sách sản phẩm từ Nhanh.vn (có phân trang theo cursor/next).
 */
export async function getAllProducts(): Promise<any[]> {
  let allProducts: any[] = [];
  let hasMore = true;
  let nextCursor: string | null = null;

  // Initial payload
  let payload: NhanhProductListPayload = {
    paginator: {
      size: 50
    }
  };

  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    if (nextCursor) {
      payload.paginator!.next = nextCursor;
    }

    const res = await getProducts(payload);

    if (res && res.code === 1) {
      const products = Array.isArray(res.data) ? res.data : (res.data ? Object.values(res.data) : []);

      if (products.length > 0) {
        allProducts = allProducts.concat(products);

        // Check for 'next' cursor in response paginator
        if (res.paginator && res.paginator.next) {
          nextCursor = res.paginator.next;
        } else {
          hasMore = false;
        }

        // Safety break
        if (pageCount > 500) {
          logger.warn("Đạt giới hạn 500 trang, dừng đồng bộ để tránh lặp vô hạn.");
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } else {
      // Error or code != 1
      logger.error(`Lỗi khi lấy danh sách sản phẩm: ${JSON.stringify(res)}`);
      hasMore = false;
    }
  }
  return allProducts;
}

/**
 * Lấy thông tin chi tiết sản phẩm theo ID từ Nhanh.vn.
 * @param id ID của sản phẩm.
 * @returns Dữ liệu chi tiết sản phẩm.
 */
export async function getByIdProduct(id: number): Promise<NhanhApiResponse<NhanhProductDetails> | null> {
  const config = await getConfig();
  try {
    const client = createNhanhClient(config);
    const data = {
      filters: {
        id: id
      }
    };
    const response = await client.post(`/product/detail?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`, data);
    return response.data;
  } catch (error) {
    logger.error(`Lỗi khi lấy thông tin sản phẩm ID ${id} từ Nhanh.vn:`, error);
    return null;
  }
}

/**
 * Tạo đơn hàng trên Nhanh.vn từ dữ liệu đơn hàng Shopify.
 * @param req Đối tượng request.
 * @param orderData Dữ liệu webhook đơn hàng từ Shopify.
 * @returns Phản hồi từ API của Nhanh.vn.
 */
export async function createOrderFromShopify(orderData: any) {
  const config = await getConfig();
  try {
    logger.info(`Bắt đầu xử lý tạo đơn hàng từ Shopify ID: ${orderData.id}`);

    // 1. Ánh xạ sản phẩm: Tìm ID sản phẩm trên Nhanh.vn dựa trên SKU của Shopify
    const products = await Promise.all(
      orderData.line_items.map(async (item: any) => {
        const itemId = await getItemWithBarCode(item.sku);
        return {
          id: itemId,
          price: Number(item.price),
          quantity: item.quantity,
          discount: Number(item.total_discount || 0),
        };
      })
    );

    // 2. Ánh xạ thông tin thanh toán
    const isPaid = orderData.financial_status === 'paid';
    const totalAmount = Number(orderData.total_price || 0);

    const paymentPayload = {
      depositAmount: 0,
      depositAccountId: 0,
      transferAmount: isPaid ? totalAmount : 0,
      transferAccountId: 0
    };

    if (orderData.shipping_address === null) {
      orderData.shipping_address = orderData.billing_address || {};
      logger.warn(`Đơn hàng Shopify ID ${orderData.id} không có địa chỉ giao hàng, sử dụng địa chỉ thanh toán thay thế.`);
    }
    // Tìm kiếm ID Thành phố và Quận/Huyện trên Nhanh.vn
    const cityId = await searchShipping('CITY', null, orderData.shipping_address?.city);
    const districtId = await searchShipping('DISTRICT', cityId, orderData.shipping_address?.address1);

    // 3. Xây dựng Payload đơn hàng cho Nhanh.vn
    const payload = {
      info: {
        type: 1,
        depotId: null,
        saleId: null,
        createdById: null,
        description: "Đơn hàng từ Shopify",
      },
      channel: {
        appOrderId: `${orderData.id}_${config.nhanh_app_id}`,
        sourceName: 'Website'
      },
      shippingAddress: {
        name: orderData.shipping_address?.name || "",
        mobile: orderData.shipping_address?.phone || "",
        cityId: cityId,
        districtId: districtId,
        wardId: null,
        address: `${orderData.shipping_address?.address1 || ""} ${orderData.shipping_address?.address2 || ""}`.trim(),
        cityName: orderData.shipping_address?.city || "",
        locationVersion: "v1"
      },
      carrier: {
        sendCarrierType: 2,
        id: null,
        serviceCode: null,
        shopId: null,
        customerShipFee: Number(orderData.shipping_lines?.[0]?.price || 0),
        isDeclaredFee: 1,
        declaredValue: totalAmount,
        extraServices: {
          isDocument: 0,
          handDelivery: 1
        }
      },
      products: products,
      payment: paymentPayload
    };

    const client = createNhanhClient(config);
    const res = await client.post(
      `/order/add?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`,
      payload
    );

    if (res.data.code === 1) {
      logger.info(`Tạo đơn hàng thành công trên Nhanh.vn cho đơn Shopify ${orderData.id}. ID Nhanh: ${res.data.data?.id}`);
    } else {
      logger.error(`Lỗi khi tạo đơn hàng trên Nhanh.vn cho đơn Shopify ${orderData.id}:`, res.data);
    }

    return res.data;
  } catch (error) {
    logger.error(`Lỗi ngoại lệ khi tạo đơn hàng từ Shopify ${orderData.id}:`, error);
    return null;
  }
}

/**
 * Lấy ID sản phẩm trên Nhanh.vn dựa trên Barcode/SKU.
 */
export async function getItemWithBarCode(barcode: string) {
  const config = await getConfig();
  try {
    if (!barcode) return null;

    const client = createNhanhClient(config);
    const data = {
      filters: {
        name: barcode
      }
    };
    const url = `product/list?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`;
    const response = await client.post(url, data);
    if (response?.data?.code === 1) {
      return response.data?.data[0]?.id || null;
    }
    return null;
  } catch (error) {
    logger.error(`Lỗi khi tìm sản phẩm theo Barcode '${barcode}':`, error);
    return null;
  }
}

/**
 * Lấy Barcode sản phẩm trên Nhanh.vn dựa trên ID sản phẩm.
 */
export async function getItemWithID(id: number) {
  const config = await getConfig();
  try {
    if (!id) return null;

    const client = createNhanhClient(config);
    const data = {
      filters: {
        ids: [id]
      }
    };
    const url = `product/list?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`;
    const response = await client.post(url, data);
    if (response?.data?.code === 1) {
      return response.data?.data[0]?.barcode || null;
    }
    return null;
  } catch (error) {
    logger.error(`Lỗi khi tìm sản phẩm theo ID '${id}':`, error);
    return null;
  }
}

// --- Các hàm tiện ích (Helper functions) ---

/**
 * Chuẩn hóa chuỗi tiếng Việt (xóa dấu, xóa tiền tố, chuyển về chữ thường) để so sánh địa chỉ.
 */
const normalize = (str: string) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")              // Khử dấu tiếng Việt
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(tinh|thanh pho|tp|quan|huyen|phuong|xa)\.?\s+/g, "") // Xóa tiền tố
    .replace(/\s+/g, " ")          // Xóa khoảng trắng thừa
    .trim();
};

/**
 * Tìm kiếm ID địa lý (Tỉnh/Thành, Quận/Huyện) trên Nhanh.vn dựa trên tên.
 */
async function searchShipping(type: string, parentId: number | null, name: string) {
  const config = await getConfig();
  try {
    if (!name) return null;
    const client = createNhanhClient(config);
    const data = {
      filters: {
        locationVersion: "v1",
        type: type,
        parentId: parentId
      }
    };
    const response = await client.post(`shipping/location?appId=${config.nhanh_app_id}&businessId=${config.nhanh_business_id}`, data);
    if (response.data.code === 1) {
      return response.data.data.find((e: any) => normalize(e.name) === normalize(name))?.id || null;
    }
    return null;
  } catch (error) {
    logger.error(`Lỗi khi tìm kiếm địa chỉ (${type}) '${name}':`, error);
    return null;
  }
}