-- Fix product visibility RLS: drop old policy, recreate with correct logic
-- 1. Drop OLD policy (from migration 153) - otherwise visibility rules are bypassed
DROP POLICY IF EXISTS "Users can view active products from active sellers" ON products;

-- 2. Drop current incomplete policy (from migration 240)
DROP POLICY IF EXISTS "Users can view visible products" ON products;

-- 3. Create correct SELECT policy with:
--    - Seller always sees own products
--    - Admin/support sees all products
--    - Others: active products from active sellers, subject to visibility rules
CREATE POLICY "Users can view visible products" ON products
FOR SELECT USING (
    -- Seller can always view their own products
    (seller_id = auth.uid())
    OR
    -- Admin/support can view all products
    (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'support')
    ))
    OR
    (
        -- Active products from active sellers only
        status = 'active'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = products.seller_id
            AND profiles.status = 'active'
        )
        AND (
            -- Either show to guests or user is authenticated
            (COALESCE(show_to_guests, true) = true OR auth.uid() IS NOT NULL)
            AND (
                -- Public visibility
                COALESCE(visibility, 'public') = 'public'
                -- Followers only
                OR (COALESCE(visibility, 'public') = 'followers_only' AND EXISTS (
                    SELECT 1 FROM follows
                    WHERE follower_id = auth.uid()
                    AND followee_id = products.seller_id
                ))
                -- Following only
                OR (COALESCE(visibility, 'public') = 'following_only' AND EXISTS (
                    SELECT 1 FROM follows
                    WHERE follower_id = products.seller_id
                    AND followee_id = auth.uid()
                ))
                -- Self only (seller only) - redundant here but kept for clarity
                OR (COALESCE(visibility, 'public') = 'self_only' AND seller_id = auth.uid())
            )
        )
    )
);