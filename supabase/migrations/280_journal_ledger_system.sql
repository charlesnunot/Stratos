-- Phase 0.4: Journal-based Ledger System
-- Financial-Grade Double-Entry Accounting with ACID guarantees
-- Phase 0.1: Webhook Event Idempotency

BEGIN;

-- ============================================================
-- WEBHOOK EVENTS TABLE (Phase 0.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider, event_id)
);

CREATE INDEX idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);

-- ============================================================
-- ACCOUNTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'buyer_clearing',
      'seller_payable',
      'seller_receivable',
      'affiliate_payable',
      'platform_escrow',
      'platform_revenue',
      'platform_fee_payable',
      'user_wallet'
    )
  ),
  owner_id UUID REFERENCES profiles(id),
  currency TEXT NOT NULL DEFAULT 'CNY',
  balance DECIMAL(10,2) DEFAULT 0,
  available_balance DECIMAL(10,2) DEFAULT 0,
  frozen_balance DECIMAL(10,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(account_type, owner_id, currency)
);

-- Index for account lookups
CREATE INDEX idx_accounts_owner ON accounts(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_accounts_type ON accounts(account_type);

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to accounts"
  ON accounts FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- JOURNAL ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES payment_transactions(id),
  journal_type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  posting_state TEXT NOT NULL DEFAULT 'pending' 
    CHECK (posting_state IN ('pending', 'posted', 'failed', 'reversed')),
  posted_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(transaction_id, journal_type, reference_id)
);

-- Indexes for journal queries
CREATE INDEX idx_journal_transaction ON journal_entries(transaction_id);
CREATE INDEX idx_journal_posting_state ON journal_entries(posting_state);
CREATE INDEX idx_journal_type ON journal_entries(journal_type);
CREATE INDEX idx_journal_reference ON journal_entries(reference_id, reference_type);

-- RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to journal_entries"
  ON journal_entries FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- LEDGER ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),
  entry_sequence INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ledger queries
CREATE UNIQUE INDEX idx_ledger_journal_sequence 
  ON ledger_entries(journal_id, entry_sequence);
CREATE INDEX idx_ledger_account_id ON ledger_entries(account_id);
CREATE INDEX idx_ledger_journal ON ledger_entries(journal_id);
CREATE INDEX idx_ledger_entry_type ON ledger_entries(entry_type);

-- RLS
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to ledger_entries"
  ON ledger_entries FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- POST JOURNAL ENTRY FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_transaction_id UUID,
  p_journal_type TEXT,
  p_reference_id UUID,
  p_reference_type TEXT,
  p_entries JSONB
)
RETURNS UUID AS $$
DECLARE
  v_journal_id UUID;
  v_entry JSONB;
  v_entry_idx INTEGER;
  v_account_ids UUID[];
  v_account_id UUID;
  v_entry_type TEXT;
  v_amount DECIMAL(10,2);
  v_currency TEXT;
  v_balance DECIMAL(10,2);
  v_new_balance DECIMAL(10,2);
  v_debit_total DECIMAL(10,2) := 0;
  v_credit_total DECIMAL(10,2) := 0;
  v_lock_key BIGINT;
  v_posting_state TEXT;
  
  v_running_balance_map JSONB := '{}'::JSONB;
  v_opening_balance_map JSONB := '{}'::JSONB;
BEGIN
  -- Step 1: Get transaction-level advisory lock
  v_lock_key := hashtext(p_transaction_id::TEXT)::BIGINT;
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RAISE EXCEPTION 'Failed to acquire lock for transaction %', p_transaction_id;
  END IF;

  -- Step 2: Collect and sort all account_ids (deadlock prevention)
  SELECT ARRAY_AGG(DISTINCT (entry->>'accountId')::UUID ORDER BY (entry->>'accountId')::UUID)
  INTO v_account_ids
  FROM jsonb_array_elements(p_entries) AS entry;

  -- Step 3: Lock accounts in deterministic order and record opening balance
  FOREACH v_account_id IN ARRAY v_account_ids
  LOOP
    PERFORM id FROM accounts WHERE id = v_account_id FOR UPDATE;
    
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    
    v_opening_balance_map := jsonb_set(v_opening_balance_map, 
      ARRAY[v_account_id::TEXT], 
      to_jsonb(v_balance)
    );
    
    v_running_balance_map := jsonb_set(v_running_balance_map, 
      ARRAY[v_account_id::TEXT], 
      to_jsonb(v_balance)
    );
  END LOOP;

  -- Step 4: Validate journal balance (debit == credit)
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_amount := (v_entry->>'amount')::DECIMAL(10,2);
    
    IF v_entry->>'entryType' = 'debit' THEN
      v_debit_total := v_debit_total + v_amount;
    ELSE
      v_credit_total := v_credit_total + v_amount;
    END IF;
  END LOOP;

  IF v_debit_total != v_credit_total THEN
    RAISE EXCEPTION 'Journal imbalance: debit=%, credit=%', v_debit_total, v_credit_total;
  END IF;

  -- Step 5: Create journal (initial state = pending)
  INSERT INTO journal_entries(
    transaction_id, journal_type, reference_id, reference_type, posting_state
  )
  VALUES (p_transaction_id, p_journal_type, p_reference_id, p_reference_type, 'pending')
  RETURNING id INTO v_journal_id;

  -- Step 6: Posting gate lock - prevent duplicate posting
  SELECT posting_state INTO v_posting_state
  FROM journal_entries
  WHERE id = v_journal_id
  FOR UPDATE;

  IF v_posting_state != 'pending' THEN
    RETURN v_journal_id;
  END IF;

  -- Step 7: Entry-level posting loop (with negative balance guard)
  v_entry_idx := 0;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) AS entry
  LOOP
    v_entry_idx := v_entry_idx + 1;
    v_account_id := (v_entry->>'accountId')::UUID;
    v_entry_type := v_entry->>'entryType';
    v_amount := (v_entry->>'amount')::DECIMAL(10,2);
    v_currency := COALESCE(v_entry->>'currency', 'CNY');

    v_balance := (v_running_balance_map->>v_account_id::TEXT)::DECIMAL(10,2);

    IF v_entry_type = 'debit' THEN
      v_new_balance := v_balance + v_amount;
    ELSE
      v_new_balance := v_balance - v_amount;
    END IF;

    -- Negative balance guard (only for credits)
    IF v_entry_type = 'credit' AND v_new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient funds on account %: balance=%', v_account_id, v_new_balance;
    END IF;

    v_running_balance_map := jsonb_set(v_running_balance_map, 
      ARRAY[v_account_id::TEXT], 
      to_jsonb(v_new_balance)
    );

    INSERT INTO ledger_entries(
      journal_id, account_id, entry_type, amount, currency, 
      balance_before, balance_after, entry_sequence
    )
    VALUES (
      v_journal_id, v_account_id, v_entry_type, 
      v_amount, v_currency, v_balance, v_new_balance,
      v_entry_idx
    );
  END LOOP;

  -- Step 8: Aggregate net change and update accounts
  DECLARE
    v_agg_record RECORD;
    v_net_changes JSONB := '{}'::JSONB;
  BEGIN
    FOR v_agg_record IN
      SELECT 
        (entry->>'accountId')::UUID AS account_id,
        SUM(
          CASE 
            WHEN entry->>'entryType' = 'debit' THEN (entry->>'amount')::DECIMAL(10,2)
            ELSE -(entry->>'amount')::DECIMAL(10,2)
          END
        ) AS net_change
      FROM jsonb_array_elements(p_entries) AS entry
      GROUP BY (entry->>'accountId')::UUID
    LOOP
      v_net_changes := jsonb_set(v_net_changes, 
        ARRAY[v_agg_record.account_id::TEXT], 
        to_jsonb(v_agg_record.net_change)
      );
    END LOOP;

    FOR v_account_id IN SELECT * FROM unnest(v_account_ids)
    LOOP
      v_amount := (v_net_changes->>v_account_id::TEXT)::DECIMAL(10,2);
      
      IF v_amount IS NOT NULL AND v_amount != 0 THEN
        v_balance := (v_running_balance_map->>v_account_id::TEXT)::DECIMAL(10,2);
        
        UPDATE accounts 
        SET balance = v_balance, updated_at = NOW()
        WHERE id = v_account_id;
      END IF;
    END LOOP;
  END;

  -- Step 9: Two-phase - update journal state after ledger write
  UPDATE journal_entries 
  SET posting_state = 'posted', 
      posted_at = NOW() 
  WHERE id = v_journal_id;

  RETURN v_journal_id;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE journal_entries 
    SET posting_state = 'failed', 
        failed_at = NOW() 
    WHERE id = v_journal_id;
    
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- REVERSE JOURNAL ENTRY FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION reverse_journal_entry(
  p_journal_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_journal_id UUID;
  v_original_journal journal_entries%ROWTYPE;
  v_entry ledger_entries%ROWTYPE;
  v_reverse_entry JSONB := '[]'::JSONB;
  v_new_journal_id UUID;
BEGIN
  -- Get original journal
  SELECT * INTO v_original_journal
  FROM journal_entries
  WHERE id = p_journal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal not found: %', p_journal_id;
  END IF;

  IF v_original_journal.posting_state != 'posted' THEN
    RAISE EXCEPTION 'Can only reverse posted journals, current state: %', v_original_journal.posting_state;
  END IF;

  -- Build reverse entries
  FOR v_entry IN SELECT * FROM ledger_entries 
    WHERE journal_id = p_journal_id 
    ORDER BY entry_sequence
  LOOP
    v_reverse_entry := v_reverse_entry || jsonb_build_array(
      jsonb_build_object(
        'accountId', v_entry.account_id,
        'entryType', CASE v_entry.entry_type 
          WHEN 'debit' THEN 'credit' 
          WHEN 'credit' THEN 'debit' 
        END,
        'amount', v_entry.amount,
        'currency', v_entry.currency
      )
    );
  END LOOP;

  -- Create reversal journal
  v_new_journal_id := post_journal_entry(
    v_original_journal.transaction_id,
    v_original_journal.journal_type || '_reversal',
    v_original_journal.reference_id,
    v_original_journal.reference_type,
    v_reverse_entry
  );

  -- Mark original as reversed
  UPDATE journal_entries
  SET posting_state = 'reversed',
      reversed_at = NOW(),
      metadata = metadata || jsonb_build_object('reversal_reason', p_reason)
  WHERE id = p_journal_id;

  RETURN v_new_journal_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GET ACCOUNT BALANCE FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION get_account_balance(
  p_account_type TEXT,
  p_owner_id UUID DEFAULT NULL,
  p_currency TEXT DEFAULT 'CNY'
)
RETURNS TABLE(
  account_id UUID,
  balance DECIMAL(10,2),
  available_balance DECIMAL(10,2),
  frozen_balance DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.balance,
    a.available_balance,
    a.frozen_balance
  FROM accounts a
  WHERE a.account_type = p_account_type
    AND (p_owner_id IS NULL OR a.owner_id = p_owner_id)
    AND a.currency = p_currency;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GET LEDGER TRAIL FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION get_ledger_trail(
  p_account_id UUID,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  journal_id UUID,
  journal_type TEXT,
  reference_type TEXT,
  entry_type TEXT,
  amount DECIMAL(10,2),
  balance_after DECIMAL(10,2),
  entry_sequence INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    le.journal_id,
    je.journal_type,
    je.reference_type,
    le.entry_type,
    le.amount,
    le.balance_after,
    le.entry_sequence,
    le.created_at
  FROM ledger_entries le
  JOIN journal_entries je ON je.id = le.journal_id
  WHERE le.account_id = p_account_id
    AND je.posting_state = 'posted'
    AND (p_from_date IS NULL OR le.created_at >= p_from_date)
    AND (p_to_date IS NULL OR le.created_at <= p_to_date)
  ORDER BY le.created_at DESC, le.entry_sequence
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROCESS WEBHOOK EVENT FUNCTION (Phase 0.1)
-- ============================================================
CREATE OR REPLACE FUNCTION process_webhook_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert webhook event with idempotency
  INSERT INTO webhook_events (provider, event_id, event_type, payload, processed_at)
  VALUES (p_provider, p_event_id, p_event_type, p_payload, NOW())
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  -- If already exists, return NULL (already processed)
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Return the event ID for processing
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INITIAL ACCOUNT SEED DATA
-- ============================================================

-- Platform escrow account (for internal payments)
INSERT INTO accounts (id, account_type, owner_id, currency, balance)
SELECT uuid_generate_v4(), 'platform_escrow', NULL, 'CNY', 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_type = 'platform_escrow' AND owner_id IS NULL);

-- Platform revenue account
INSERT INTO accounts (id, account_type, owner_id, currency, balance)
SELECT uuid_generate_v4(), 'platform_revenue', NULL, 'CNY', 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_type = 'platform_revenue' AND owner_id IS NULL);

COMMIT;
