-- Migration 255: Add multi-currency support to subscriptions and payment_transactions
-- This migration adds fields to support displaying user currency while collecting in platform currency

-- Add multi-currency fields to subscriptions table
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS user_amount DECIMAL(10,2),           -- 用户看到的金额
ADD COLUMN IF NOT EXISTS user_currency TEXT,                   -- 用户选择的货币
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,6),          -- 支付时的汇率
ADD COLUMN IF NOT EXISTS exchange_rate_at TIMESTAMPTZ;         -- 汇率生效时间

-- Add multi-currency fields to payment_transactions table
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS user_amount DECIMAL(10,2),            -- 用户支付金额
ADD COLUMN IF NOT EXISTS user_currency TEXT,                   -- 用户支付货币
ADD COLUMN IF NOT EXISTS platform_amount DECIMAL(10,2),        -- 平台收款金额
ADD COLUMN IF NOT EXISTS platform_currency TEXT,               -- 平台收款货币
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,6),          -- 支付时的汇率
ADD COLUMN IF NOT EXISTS exchange_rate_at TIMESTAMPTZ;         -- 汇率生效时间

-- Add comments for documentation
COMMENT ON COLUMN subscriptions.user_amount IS 'Amount displayed to user in their selected currency';
COMMENT ON COLUMN subscriptions.user_currency IS 'Currency selected by user for display';
COMMENT ON COLUMN subscriptions.exchange_rate IS 'Exchange rate used for conversion at time of subscription';
COMMENT ON COLUMN subscriptions.exchange_rate_at IS 'Timestamp when exchange rate was recorded';

COMMENT ON COLUMN payment_transactions.user_amount IS 'Amount paid by user in their currency';
COMMENT ON COLUMN payment_transactions.user_currency IS 'Currency used by user for payment';
COMMENT ON COLUMN payment_transactions.platform_amount IS 'Amount received by platform in platform currency';
COMMENT ON COLUMN payment_transactions.platform_currency IS 'Currency used by platform for settlement';
COMMENT ON COLUMN payment_transactions.exchange_rate IS 'Exchange rate used for conversion at time of payment';
COMMENT ON COLUMN payment_transactions.exchange_rate_at IS 'Timestamp when exchange rate was recorded';

-- Create index for faster queries on multi-currency fields
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_currency ON subscriptions(user_currency);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_currency ON payment_transactions(user_currency);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_platform_currency ON payment_transactions(platform_currency);
