-- Add shipped_at and received_at timestamps to orders table
-- These fields track when orders are shipped and when buyers confirm receipt

-- Add shipped_at and received_at timestamps
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN orders.shipped_at IS 'Timestamp when seller shipped the order';
COMMENT ON COLUMN orders.received_at IS 'Timestamp when buyer confirmed receipt';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_orders_shipped_at ON orders(shipped_at) WHERE shipped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_received_at ON orders(received_at) WHERE received_at IS NOT NULL;
