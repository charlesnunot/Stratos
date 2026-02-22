-- Add currency support to orders, products, and subscriptions tables
-- This migration adds currency fields to support international payments

-- Add currency to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' 
  CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'));

-- Add currency to products table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' 
  CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'));

-- Update payment_transactions currency default to USD (was CNY)
ALTER TABLE payment_transactions
  ALTER COLUMN currency SET DEFAULT 'USD';

-- Update existing records to USD if they are NULL or invalid
UPDATE payment_transactions
SET currency = 'USD'
WHERE currency IS NULL OR currency NOT IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD');

-- Extend payment_accounts table to support multi-currency
ALTER TABLE payment_accounts 
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' 
  CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] DEFAULT ARRAY['USD']::TEXT[];

-- Create exchange_rates table for historical rate tracking
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate DECIMAL(15, 8) NOT NULL,
  source TEXT DEFAULT 'manual', -- 'manual', 'api', 'stripe', 'paypal'
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(base_currency, target_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
  ON exchange_rates(base_currency, target_currency, valid_from DESC);

-- Index for currency queries
CREATE INDEX IF NOT EXISTS idx_orders_currency ON orders(currency);
CREATE INDEX IF NOT EXISTS idx_products_currency ON products(currency);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_currency ON payment_accounts(currency);
