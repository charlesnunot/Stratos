-- ============================================================
-- Ledger System Fixes - Migration 281
-- ============================================================
-- Fixes:
-- 1. Add internal_wallet to account_type CHECK constraint
-- 2. Fix RLS policies for accounts table
-- ============================================================

BEGIN;

-- 1. Add internal_wallet to account_type CHECK constraint
ALTER TABLE accounts DROP CONSTRAINT accounts_account_type_check;

ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check CHECK (
  account_type IN (
    'buyer_clearing',
    'seller_payable',
    'seller_receivable',
    'affiliate_payable',
    'platform_escrow',
    'platform_revenue',
    'platform_fee_payable',
    'user_wallet',
    'internal_wallet'
  )
);

-- 2. Fix RLS policies for accounts table - use service role instead of authenticated
-- First drop the existing overly permissive policy
DROP POLICY IF EXISTS "Admin full access to accounts" ON accounts;

-- Create a more restrictive policy that only allows service role
CREATE POLICY "Service role full access to accounts"
  ON accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. RLS for journal_entries table - use service role
DROP POLICY IF EXISTS "Admin full access to journal_entries" ON journal_entries;

CREATE POLICY "Service role full access to journal_entries"
  ON journal_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. RLS for ledger_entries table - use service role
DROP POLICY IF EXISTS "Admin full access to ledger_entries" ON ledger_entries;

CREATE POLICY "Service role full access to ledger_entries"
  ON ledger_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RLS for webhook_events table - use service role
DROP POLICY IF EXISTS "Admin full access to webhook_events" ON webhook_events;

CREATE POLICY "Service role full access to webhook_events"
  ON webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
