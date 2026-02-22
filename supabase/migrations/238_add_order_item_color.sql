-- Add color and size columns to order_items table
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS size TEXT;

-- Add comments for new columns
COMMENT ON COLUMN order_items.color IS '订单项选择的颜色';
COMMENT ON COLUMN order_items.size IS '订单项选择的尺寸';

-- Add RLS policy for new columns if not exists
DO $$
BEGIN
  -- Check if RLS is enabled on order_items table
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'order_items' AND c.relrowsecurity = true
  ) THEN
    -- Check if select policy exists for authenticated users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'order_items' AND policyname = 'Users can view own order items'
    ) THEN
      -- This is just a safety check, assuming existing RLS policies are already in place
      RAISE NOTICE 'No existing select policy found for order_items table';
    END IF;
  END IF;
END $$;
