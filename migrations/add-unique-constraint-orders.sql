-- Migration: Add unique constraint to shopify_order_id in orders table
-- Created: 2026-02-12
-- Purpose: Prevent duplicate orders when Shopify sends webhook multiple times

-- First, remove any duplicate records (keep the most recent one)
DELETE t1 FROM orders t1
INNER JOIN orders t2 
WHERE 
    t1.shopify_order_id = t2.shopify_order_id
    AND t1.id < t2.id;

-- Add unique constraint to shopify_order_id
ALTER TABLE orders 
ADD UNIQUE KEY unique_shopify_order_id (shopify_order_id);
