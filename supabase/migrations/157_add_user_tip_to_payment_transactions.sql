-- Add 'user_tip' type to payment_transactions table
-- ✅ 支持直接打赏用户的支付类型

-- Update the type constraint to include 'user_tip'
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_type_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_type_check
  CHECK (type IN ('order', 'subscription', 'tip', 'user_tip'));

-- Add comment
COMMENT ON COLUMN payment_transactions.type IS 'Payment type: order, subscription, tip (for post), or user_tip (direct user tipping)';
