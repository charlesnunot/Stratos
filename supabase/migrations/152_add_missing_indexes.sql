-- Add missing indexes for critical query patterns
-- This migration ensures all frequently queried fields have indexes

-- Orders table indexes
-- Payment status and order status are frequently queried together
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status) 
  WHERE payment_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status) 
  WHERE order_status IS NOT NULL;

-- Composite index for common query pattern: buyer orders by status
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON orders(buyer_id, order_status, created_at DESC)
  WHERE buyer_id IS NOT NULL;

-- Composite index for common query pattern: seller orders by status
CREATE INDEX IF NOT EXISTS idx_orders_seller_status ON orders(seller_id, order_status, created_at DESC)
  WHERE seller_id IS NOT NULL;

-- Index for payment status queries (frequently used in admin and seller dashboards)
CREATE INDEX IF NOT EXISTS idx_orders_payment_order_status ON orders(payment_status, order_status, created_at DESC);

-- Products table indexes
-- Status is frequently queried for active products
CREATE INDEX IF NOT EXISTS idx_products_status_created ON products(status, created_at DESC)
  WHERE status = 'active';

-- Composite index for seller products by status
CREATE INDEX IF NOT EXISTS idx_products_seller_status ON products(seller_id, status, created_at DESC)
  WHERE seller_id IS NOT NULL;

-- Subscriptions table indexes
-- User subscriptions by status (frequently queried)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Index for active subscriptions lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expires ON subscriptions(status, expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- Payment accounts table indexes
-- Seller payment accounts by verification status
CREATE INDEX IF NOT EXISTS idx_payment_accounts_seller_verified ON payment_accounts(seller_id, verification_status, is_default)
  WHERE seller_id IS NOT NULL;

-- Order groups table indexes (if not already exists)
CREATE INDEX IF NOT EXISTS idx_order_groups_buyer_status ON order_groups(buyer_id, order_status, created_at DESC)
  WHERE buyer_id IS NOT NULL;

-- Order disputes indexes
CREATE INDEX IF NOT EXISTS idx_order_disputes_order_id ON order_disputes(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON order_disputes(status, created_at DESC)
  WHERE status IS NOT NULL;

-- Order refunds indexes
CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_refunds_status ON order_refunds(status, created_at DESC)
  WHERE status IS NOT NULL;

-- Seller debts indexes
CREATE INDEX IF NOT EXISTS idx_seller_debts_seller_status ON seller_debts(seller_id, status, created_at DESC)
  WHERE seller_id IS NOT NULL;

-- Affiliate commissions indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_status ON affiliate_commissions(affiliate_id, status, created_at DESC)
  WHERE affiliate_id IS NOT NULL;

-- Comments indexes: post comments use post_id (see 046); product_comments use product_id (see 084).
-- Add composite index for "comments by post, sorted by created_at" if not redundant with idx_comments_post_id
CREATE INDEX IF NOT EXISTS idx_comments_post_id_created_at ON comments(post_id, created_at DESC)
  WHERE post_id IS NOT NULL;

-- Add comment explaining the indexes
COMMENT ON INDEX idx_orders_buyer_status IS 'Optimizes queries for buyer orders filtered by status';
COMMENT ON INDEX idx_orders_seller_status IS 'Optimizes queries for seller orders filtered by status';
COMMENT ON INDEX idx_products_status_created IS 'Optimizes queries for active products sorted by creation date';
COMMENT ON INDEX idx_subscriptions_user_status IS 'Optimizes queries for user subscriptions filtered by status';
