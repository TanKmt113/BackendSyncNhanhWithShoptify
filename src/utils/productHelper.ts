import { ShopifyVariant, ShopifyProductOption, ShopifyImage } from "../types/shopify.types";
import { NhanhProductDetails, NhanhProductChild, NhanhAttribute } from "../types/nhanh.types";

/**
 * Build a single Shopify variant from Nhanh product data
 * @param data Nhanh product or child data
 * @param attributes Optional attributes for variant options
 * @returns Shopify variant object
 */
export function buildShopifyVariant(
  data: NhanhProductDetails | NhanhProductChild,
  attributes?: NhanhAttribute[]
): ShopifyVariant {
  const variant: ShopifyVariant = {
    sku: data.barcode || data.code || '',
    price: data.prices?.retail?.toString() || "0",
    inventory_management: "shopify",
    inventory_policy: "deny",
    inventory_quantity: data.inventory?.available || 0,
  };

  // Add optional properties only if they exist
  if (data.prices?.old) {
    variant.compare_at_price = data.prices.old.toString();
  }
  if (data.prices?.import) {
    variant.cost = data.prices.import.toString();
  }

  // Add variant options from attributes
  if (attributes && attributes.length > 0) {
    attributes.forEach((attr, index) => {
      if (index === 0) variant.option1 = attr.value;
      else if (index === 1) variant.option2 = attr.value;
      else if (index === 2) variant.option3 = attr.value;
    });
  }

  // Add shipping weight
  if (data.shipping?.weight) {
    variant.weight = data.shipping.weight;
    variant.weight_unit = "g";
  }

  return variant;
}

/**
 * Build variants array and options map from Nhanh product with children
 * @param productDetails Nhanh product details
 * @returns Object containing variants array and options map
 */
export function buildVariantsAndOptions(productDetails: NhanhProductDetails): {
  variants: ShopifyVariant[];
  optionsMap: Map<string, Set<string>>;
} {
  const variants: ShopifyVariant[] = [];
  const optionsMap = new Map<string, Set<string>>();

  const parentBarcode = productDetails.barcode || productDetails.code;
  const hasChildren = productDetails.childs && productDetails.childs.length > 0;

  if (hasChildren) {
    // Check if parent barcode is different from all child barcodes
    const childBarcodes = productDetails.childs!.map(c => c.barcode || c.code);
    const parentIsDifferent = parentBarcode && !childBarcodes.includes(parentBarcode);

    // If parent has unique barcode, add it as first variant
    if (parentIsDifferent) {
      const parentVariant = buildShopifyVariant(productDetails);

      // Add default option values for parent
      const firstChild = productDetails.childs![0];
      if (firstChild?.attributes && firstChild.attributes.length > 0) {
        firstChild.attributes.forEach((attr, index) => {
          if (index === 0) parentVariant.option1 = "Default";
          else if (index === 1) parentVariant.option2 = "Default";
          else if (index === 2) parentVariant.option3 = "Default";

          // Collect option name and "Default" value
          if (!optionsMap.has(attr.name)) {
            optionsMap.set(attr.name, new Set<string>());
          }
          optionsMap.get(attr.name)!.add("Default");
        });
      }

      variants.push(parentVariant);
    }

    // Add child variants
    productDetails.childs!.forEach(child => {
      const childVariant = buildShopifyVariant(child, child.attributes);

      // Collect option names and values
      if (child.attributes) {
        child.attributes.forEach(attr => {
          if (!optionsMap.has(attr.name)) {
            optionsMap.set(attr.name, new Set<string>());
          }
          optionsMap.get(attr.name)!.add(attr.value);
        });
      }

      variants.push(childVariant);
    });
  } else {
    // Single product, no variants
    const variant = buildShopifyVariant(productDetails, productDetails.attributes);

    // Collect options from attributes
    if (productDetails.attributes?.length) {
      productDetails.attributes.forEach(attr => {
        if (!optionsMap.has(attr.name)) {
          optionsMap.set(attr.name, new Set<string>());
        }
        optionsMap.get(attr.name)!.add(attr.value);
      });
    }

    variants.push(variant);
  }

  return { variants, optionsMap };
}

/**
 * Build Shopify product options array from options map
 * @param optionsMap Map of option names to their values
 * @returns Array of Shopify product options
 */
export function buildProductOptions(optionsMap: Map<string, Set<string>>): ShopifyProductOption[] {
  const options: ShopifyProductOption[] = [];
  
  optionsMap.forEach((values, name) => {
    options.push({
      name,
      values: Array.from(values)
    });
  });

  return options;
}

/**
 * Build images array from Nhanh product data
 * @param productDetails Nhanh product details
 * @param fallbackImage Fallback image URL
 * @returns Array of Shopify images
 */
export function buildProductImages(
  productDetails?: NhanhProductDetails,
  fallbackImage?: string
): ShopifyImage[] {
  const images: ShopifyImage[] = [];

  if (productDetails?.images?.avatar) {
    images.push({ src: productDetails.images.avatar });
  }

  if (productDetails?.images?.others?.length) {
    productDetails.images.others.forEach(img => {
      images.push({ src: img });
    });
  }

  // Fallback to provided image
  if (images.length === 0 && fallbackImage) {
    images.push({ src: fallbackImage });
  }

  return images;
}
