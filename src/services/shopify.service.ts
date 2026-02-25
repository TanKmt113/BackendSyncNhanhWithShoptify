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
  let productPayload: any; // Declare outside try block to access in catch
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
    const optionsMap = new Map<string, Set<string>>(); // To collect all option names and their values

    if (productDetails?.childs && Array.isArray(productDetails.childs) && productDetails.childs.length > 0) {
      // Product has variants

      // Check if parent barcode is different from all child barcodes
      const parentBarcode = productDetails.barcode || productDetails.code;
      const childBarcodes = productDetails.childs.map((c: any) => c.barcode || c.code);
      const parentIsDifferent = parentBarcode && !childBarcodes.includes(parentBarcode);

      // If parent has unique barcode, add it as first variant
      if (parentIsDifferent) {
        const parentVariant: any = {
          sku: parentBarcode,
          price: productDetails.prices?.retail?.toString() || "0",
          compare_at_price: productDetails.prices?.old?.toString() || undefined,
          cost: productDetails.prices?.import?.toString() || undefined,
          inventory_management: "shopify",
          inventory_policy: "deny",
          inventory_quantity: productDetails.inventory?.available || 0,
        };

        // Add default option values for parent and collect them
        if (productDetails.childs[0].attributes && Array.isArray(productDetails.childs[0].attributes)) {
          productDetails.childs[0].attributes.forEach((attr: any, index: number) => {
            const optionKey = `option${index + 1}`;
            parentVariant[optionKey] = "Default"; // Or use parent's attribute if exists

            // Collect option name and "Default" value
            if (!optionsMap.has(attr.name)) {
              optionsMap.set(attr.name, new Set<string>());
            }
            optionsMap.get(attr.name)!.add("Default");
          });
        }

        if (productDetails.shipping?.weight) {
          parentVariant.weight = productDetails.shipping.weight;
          parentVariant.weight_unit = "g";
        }

        variants.push(parentVariant);
      }

      // Add child variants
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
            const optionKey = `option${index + 1}`;
            childVariant[optionKey] = attr.value;

            // Collect option names and values for product options
            if (!optionsMap.has(attr.name)) {
              optionsMap.set(attr.name, new Set<string>());
            }
            optionsMap.get(attr.name)!.add(attr.value);
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
      // If product has attributes, add them as options to the single variant
      if (productDetails?.attributes && Array.isArray(productDetails.attributes) && productDetails.attributes.length > 0) {
        productDetails.attributes.forEach((attr: any, index: number) => {
          const optionKey = `option${index + 1}`;
          variant[optionKey] = attr.value;
          
          // Collect option for options array
          if (!optionsMap.has(attr.name)) {
            optionsMap.set(attr.name, new Set<string>());
          }
          optionsMap.get(attr.name)!.add(attr.value);
        });
      }
      
      variants.push(variant);
    }

    // Build product options from collected variant attributes
    const options: any[] = [];
    if (optionsMap.size > 0) {
      // Build options from variants attributes
      optionsMap.forEach((values, name) => {
        options.push({
          name: name,
          values: Array.from(values)
        });
      });
    }

    // Build final product payload
    productPayload = {
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
    if (axios.isAxiosError(error)) {
      logger.error("Error creating product on Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Error creating product on Shopify:", error);
    }
    return false;
  }
}

/**
 * Lấy thông tin đơn hàng từ Shopify theo ID
 * @param shopifyOrderId ID của đơn hàng trên Shopify
 * @returns Order data hoặc null nếu không tìm thấy
 */
export async function getOrderById(shopifyOrderId: string | number) {
  const config = await getConfig();
  try {
    const client = createShoptify(config);
    // Lấy đầy đủ thông tin order bao gồm shipping_address, billing_address, line_items, customer, etc.
    // Không truyền fields parameter để lấy tất cả thông tin như webhook
    const response = await client.get(`/orders/${shopifyOrderId}.json`, {});

    if (response.data && response.data.order) {
      const order = response.data.order;
      return order;
    }

    logger.warn(`Order ${shopifyOrderId} not found on Shopify`);
    return null;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error(`Error fetching order ${shopifyOrderId} from Shopify:`, error.response?.data || error.message);
    } else {
      logger.error(`Error fetching order ${shopifyOrderId} from Shopify:`, error);
    }
    return null;
  }
}

/**
 * Add a new variant to an existing product on Shopify
 * @param parentBarcode Barcode of parent product to find on Shopify
 * @param variantData Variant data from Nhanh.vn
 * @returns true if successful, false otherwise
 */
export async function addVariantToProduct(parentBarcode: string, variantData: any): Promise<boolean> {
  const config = await getConfig();
  try {
    const client = createShoptify(config);

    // 1. Find parent product by barcode and get full product details
    const query = `
      {
        productVariants(first: 1, query: "sku:${parentBarcode}") {
          edges {
            node {
              id
              product {
                id
                options {
                  id
                  name
                  values
                  position
                }
              }
            }
          }
        }
      }
    `;

    const queryRes = await client.post("/graphql.json", { query });

    if (queryRes.data.errors || !queryRes.data?.data?.productVariants?.edges?.length) {
      logger.error(`Product with barcode ${parentBarcode} not found on Shopify`);
      return false;
    }

    const productData = queryRes.data.data.productVariants.edges[0].node.product;
    const productId = productData.id;
    const existingOptions = productData.options || [];
    
    // Extract numeric ID from GraphQL ID (gid://shopify/Product/1234567890)
    const numericProductId = productId.split('/').pop();
    console.log(`Found parent product on Shopify with ID: ${numericProductId} for barcode: ${parentBarcode}`);

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
    const attributeToOptionPosition = new Map<string, number>(); // attribute name -> option position (1-based)
    
    variantAttributes.forEach((attr: any) => {
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
          logger.error(`Failed to update product options and variants:`, err.response?.data || err.message);
          return false;
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
          logger.error(`Failed to update product options:`, err.response?.data || err.message);
          return false;
        }
      }
    }

    // 5. Build variant payload with correct option mapping
    const variantPayload: any = {
      sku: variantData.barcode || variantData.code,
      price: variantData.prices?.retail?.toString() || "0",
      compare_at_price: variantData.prices?.old?.toString() || undefined,
      cost: variantData.prices?.import?.toString() || undefined,
      inventory_management: "shopify",
      inventory_policy: "deny",
      inventory_quantity: variantData.inventory?.available || 0,
    };

    // Map attributes to correct option positions
    variantAttributes.forEach((attr: any) => {
      const position = attributeToOptionPosition.get(attr.name);
      if (position !== undefined) {
        const optionKey = `option${position + 1}`;
        variantPayload[optionKey] = attr.value;
      }
    });

    // Add shipping weight
    if (variantData.shipping?.weight) {
      variantPayload.weight = variantData.shipping.weight;
      variantPayload.weight_unit = "g";
    }

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
    if (axios.isAxiosError(error)) {
      logger.error("Error adding variant to product on Shopify:", error.response?.data || error.message);
    } else {
      logger.error("Error adding variant to product on Shopify:", error);
    }
    return false;
  }
}

