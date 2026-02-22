-- Add color_options column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS color_options JSONB DEFAULT '[]';

-- Add comment for color_options column
COMMENT ON COLUMN products.color_options IS '商品颜色选项，格式：[{name: string, image_url: string | null, image_from_index: number | null}]';

-- Add RLS policy for color_options if not exists
DO $$
BEGIN
  -- Check if RLS is enabled on products table
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'products' AND c.relrowsecurity = true
  ) THEN
    -- Check if update policy exists for authenticated users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can update own products'
    ) THEN
      -- This is just a safety check, assuming existing RLS policies are already in place
      RAISE NOTICE 'No existing update policy found for products table';
    END IF;
  END IF;
END $$;
