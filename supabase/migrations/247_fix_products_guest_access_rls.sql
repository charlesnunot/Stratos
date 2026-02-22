-- Fix products RLS policy to support guest access

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view visible products" ON products;

-- Create new policy with proper guest access support
CREATE POLICY "Users can view visible products" ON products
FOR SELECT USING (
    -- Sellers can view their own products
    (seller_id = auth.uid())
    OR
    -- Admins/support can view all products
    (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'support')
    ))
    OR
    (
        -- Only active products from active sellers
        status = 'active'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = products.seller_id
            AND profiles.status = 'active'
        )
        AND (
            -- Guest access: only public products
            (auth.uid() IS NULL AND COALESCE(visibility, 'public') = 'public')
            OR
            -- Authenticated user access
            (auth.uid() IS NOT NULL AND COALESCE(show_to_guests, true) = true)
            AND (
                -- Public visibility
                COALESCE(visibility, 'public') = 'public'
                -- Followers only (requires authentication)
                OR (COALESCE(visibility, 'public') = 'followers_only' AND EXISTS (
                    SELECT 1 FROM follows
                    WHERE follower_id = auth.uid()
                    AND followee_id = products.seller_id
                ))
                -- Following only (requires authentication)
                OR (COALESCE(visibility, 'public') = 'following_only' AND EXISTS (
                    SELECT 1 FROM follows
                    WHERE follower_id = auth.uid()
                    AND followee_id = products.seller_id
                ))
                -- Self only (requires authentication)
                OR (COALESCE(visibility, 'public') = 'self_only' AND seller_id = auth.uid())
            )
        )
    )
);