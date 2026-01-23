-- Create payment_transactions table for unified payment tracking and idempotency
-- This table tracks all payment attempts across all payment providers (Stripe, PayPal, Alipay, WeChat, Bank)

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('order', 'subscription', 'tip')),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  provider_ref TEXT NOT NULL, -- Unique reference from provider: session_id, payment_intent_id, trade_no, order_id, etc.
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  related_id UUID NOT NULL, -- References order_id, subscription_id, or tip id
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional provider-specific data
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint for idempotency: same provider + provider_ref should only exist once
CREATE UNIQUE INDEX idx_payment_transactions_provider_ref 
  ON payment_transactions(provider, provider_ref);

-- Index for querying by type and related_id
CREATE INDEX idx_payment_transactions_type_related 
  ON payment_transactions(type, related_id);

-- Index for querying by status
CREATE INDEX idx_payment_transactions_status 
  ON payment_transactions(status);

-- Index for querying by created_at (for reconciliation)
CREATE INDEX idx_payment_transactions_created_at 
  ON payment_transactions(created_at DESC);

-- Index for querying by provider
CREATE INDEX idx_payment_transactions_provider 
  ON payment_transactions(provider);

-- Add audit fields to orders table if they don't exist
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Add audit fields to subscriptions table if they don't exist
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Add audit fields to tips table if they don't exist
ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_transaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_payment_transaction_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transaction_updated_at();

-- RLS Policies
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own payment transactions
CREATE POLICY "Users can view own payment transactions" ON payment_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders WHERE id = payment_transactions.related_id AND buyer_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM subscriptions WHERE id::text = payment_transactions.related_id::text AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM tips WHERE id::text = payment_transactions.related_id::text AND (tipper_id = auth.uid() OR recipient_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- Only service role can insert/update payment transactions (via backend API)
CREATE POLICY "Service role can manage payment transactions" ON payment_transactions
  FOR ALL USING (false);

-- Comment
COMMENT ON TABLE payment_transactions IS 'Unified payment transaction table for tracking all payment attempts across all providers';
COMMENT ON COLUMN payment_transactions.provider_ref IS 'Unique reference from payment provider (session_id, payment_intent_id, trade_no, etc.)';
COMMENT ON COLUMN payment_transactions.related_id IS 'References order_id, subscription_id (as UUID), or tip id';
COMMENT ON COLUMN payment_transactions.metadata IS 'Additional provider-specific payment data stored as JSON';
