-- Add binding fields to seller_deposit_lots table
-- These fields allow precise tracking of which order and payment session triggered the deposit requirement
-- This enables:
-- 1. Precise deposit release (knowing which order triggered it)
-- 2. Precise audit trail ("which payment triggered the deposit")
-- 3. Support for multiple payment channels in parallel
-- 4. Future precise deposit management based on order_id

ALTER TABLE seller_deposit_lots
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT CHECK (payment_provider IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  ADD COLUMN IF NOT EXISTS payment_session_id TEXT, -- Stripe session_id, PayPal order_id, Alipay trade_no, WeChat transaction_id, etc.
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT DEFAULT 'pre_payment_risk' CHECK (trigger_reason IN ('pre_payment_risk', 'order_created', 'manual', 'other'));

-- Add index for efficient querying by order_id
CREATE INDEX IF NOT EXISTS idx_seller_deposit_lots_order_id ON seller_deposit_lots(order_id) WHERE order_id IS NOT NULL;

-- Add index for querying by payment session
CREATE INDEX IF NOT EXISTS idx_seller_deposit_lots_payment_session ON seller_deposit_lots(payment_provider, payment_session_id) 
  WHERE payment_provider IS NOT NULL AND payment_session_id IS NOT NULL;

-- Add comment explaining the fields
COMMENT ON COLUMN seller_deposit_lots.order_id IS 'The order that triggered this deposit requirement';
COMMENT ON COLUMN seller_deposit_lots.payment_provider IS 'Payment provider used (stripe, paypal, alipay, wechat, bank)';
COMMENT ON COLUMN seller_deposit_lots.payment_session_id IS 'Payment session ID from the provider (Stripe session_id, PayPal order_id, etc.)';
COMMENT ON COLUMN seller_deposit_lots.trigger_reason IS 'Reason why deposit was triggered (pre_payment_risk = triggered before payment, order_created = triggered on order creation, manual = manually triggered, other = other reasons)';
