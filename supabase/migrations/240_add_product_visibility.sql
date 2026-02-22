-- Add product visibility columns (only if they don't exist)
DO $$
BEGIN
    -- Add allow_search column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' 
                   AND column_name = 'allow_search') THEN
        ALTER TABLE products
        ADD COLUMN allow_search BOOLEAN DEFAULT true;
    END IF;
    
    -- Add show_to_guests column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' 
                   AND column_name = 'show_to_guests') THEN
        ALTER TABLE products
        ADD COLUMN show_to_guests BOOLEAN DEFAULT true;
    END IF;
    
    -- Add visibility column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' 
                   AND column_name = 'visibility') THEN
        ALTER TABLE products
        ADD COLUMN visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'followers_only', 'following_only', 'self_only'));
    END IF;
END $$;

-- Update existing rows to set default values
UPDATE products
SET allow_search = COALESCE(allow_search, true),
    show_to_guests = COALESCE(show_to_guests, true),
    visibility = COALESCE(visibility, 'public');

-- Update RLS policy for products table
-- Replace existing SELECT policy with visibility logic
DO $$
BEGIN
    -- Drop existing SELECT policy if it exists
    IF EXISTS (SELECT 1 FROM pg_policies 
               WHERE schemaname = 'public' 
               AND tablename = 'products' 
               AND policyname = 'Users can view visible products') THEN
        DROP POLICY "Users can view visible products" ON products;
    END IF;
    
    -- Create new SELECT policy with visibility logic
    CREATE POLICY "Users can view visible products" ON products
    FOR SELECT USING (
        -- Seller can always view their own products
        (seller_id = auth.uid())
        OR (
            -- Active products only
            status = 'active'
            AND (
                -- Either show to guests or user is authenticated
                (show_to_guests = true OR auth.uid() IS NOT NULL)
                AND (
                    -- Public visibility
                    visibility = 'public'
                    -- Followers only
                    OR (visibility = 'followers_only' AND EXISTS (
                        SELECT 1 FROM follows 
                        WHERE follower_id = auth.uid() 
                        AND followee_id = seller_id
                    ))
                    -- Following only
                    OR (visibility = 'following_only' AND EXISTS (
                        SELECT 1 FROM follows 
                        WHERE follower_id = seller_id 
                        AND followee_id = auth.uid()
                    ))
                    -- Self only (seller only)
                    OR (visibility = 'self_only' AND seller_id = auth.uid())
                )
            )
        )
    );
END $$;
