-- Add affiliate_post_id field to orders table
-- This migration adds affiliate_post_id to track which specific affiliate post led to an order
-- affiliate_id is kept as a redundant field (derived from affiliate_posts.affiliate_id)

-- ============================================
-- 1. Add affiliate_post_id column
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS affiliate_post_id UUID REFERENCES affiliate_posts(id) ON DELETE SET NULL;

-- ============================================
-- 2. Create index for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_post_id ON orders(affiliate_post_id);

-- ============================================
-- 3. Add comment for documentation
-- ============================================

COMMENT ON COLUMN orders.affiliate_post_id IS 'References the specific affiliate post that led to this order. affiliate_id is derived from affiliate_posts.affiliate_id';
