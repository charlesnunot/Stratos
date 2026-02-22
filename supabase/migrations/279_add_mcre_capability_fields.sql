-- Add MCRE (Monetization Capability Resolution Engine) fields to payment_accounts
-- This enables cryptographic attestation for payment account binding

ALTER TABLE payment_accounts
ADD COLUMN IF NOT EXISTS capability_resolution_id TEXT,
ADD COLUMN IF NOT EXISTS capability_hash_proof TEXT,
ADD COLUMN IF NOT EXISTS capability_attestation_signature TEXT,
ADD COLUMN IF NOT EXISTS capability_resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_accounts_capability_resolution
ON payment_accounts(capability_resolution_id);

COMMENT ON COLUMN payment_accounts.capability_resolution_id
IS 'MCRE resolution ID - references the capability snapshot at binding time';

COMMENT ON COLUMN payment_accounts.capability_hash_proof
IS 'MCRE hash proof - SHA256 of canonical payload for verification';

COMMENT ON COLUMN payment_accounts.capability_attestation_signature
IS 'MCRE platform signature - RSA signature of hashProof + resolvedAt';

COMMENT ON COLUMN payment_accounts.capability_resolved_at
IS 'MCRE resolution timestamp - when the capability was resolved';
