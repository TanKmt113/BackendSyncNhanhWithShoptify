-- Migration: Add order_data, shipping_address and line_items columns to orders table
-- Created: 2026-02-12

-- Add order_data column to store full Shopify order data
ALTER TABLE orders 
ADD COLUMN order_data JSON COMMENT 'Full order data from Shopify webhook';

-- Add shipping_address column to store shipping address
ALTER TABLE orders 
ADD COLUMN shipping_address JSON COMMENT 'Shipping address from Shopify order';

-- Add line_items column to store product information
ALTER TABLE orders 
ADD COLUMN line_items JSON COMMENT 'Product line items from Shopify order';

-- Update existing records: set columns to NULL (they will be populated on next webhook or retry)
-- No data migration needed as existing records can function without these fields
