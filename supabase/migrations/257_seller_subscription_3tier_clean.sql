-- Migration: 3档纯净模式 - 卖家订阅系统重构
-- Date: 2025-02-09
-- Description: 从5档(5/15/40/80/200)迁移到3档(15/80/200)，添加商品数量限制和首月折扣

-- ============================================
-- Step 1: 添加新字段到 subscriptions 表
-- ============================================

ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS subscription_tier INTEGER,
ADD COLUMN IF NOT EXISTS display_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS product_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_discounted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS discount_expiry_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deposit_credit DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- 添加注释
COMMENT ON COLUMN subscriptions.subscription_tier IS '内部档位值: 15/80/200';
COMMENT ON COLUMN subscriptions.display_price IS '显示价格(可能不同于tier,如Growth显示79但tier是80)';
COMMENT ON COLUMN subscriptions.product_limit IS '商品数量限制: 50/200/500';
COMMENT ON COLUMN subscriptions.is_discounted IS '是否首月折扣';
COMMENT ON COLUMN subscriptions.discount_expiry_date IS '折扣到期日';
COMMENT ON COLUMN subscriptions.deposit_credit IS '保证金额度(等于subscription_tier)';

-- ============================================
-- Step 2: 添加新字段到 profiles 表
-- ============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS seller_type VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS product_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_tier INTEGER;

COMMENT ON COLUMN profiles.seller_type IS '卖家类型: direct(直营)/null(普通)';
COMMENT ON COLUMN profiles.product_limit IS '当前商品数量限制';
COMMENT ON COLUMN profiles.subscription_tier IS '当前订阅档位';

-- ============================================
-- Step 3: 迁移现有数据 - 将旧5档映射到新3档
-- ============================================

-- 3.1 首先为所有现有卖家订阅填充基础字段
UPDATE subscriptions 
SET 
    subscription_tier = CASE 
        WHEN amount <= 5 THEN 15      -- $5 -> Starter ($15)
        WHEN amount <= 15 THEN 15     -- $15 -> Starter
        WHEN amount <= 40 THEN 80     -- $40 -> Growth ($79)
        WHEN amount <= 80 THEN 80     -- $80 -> Growth
        WHEN amount <= 200 THEN 200   -- $200 -> Scale ($199)
        ELSE 15
    END,
    deposit_credit = CASE 
        WHEN amount <= 5 THEN 15
        WHEN amount <= 15 THEN 15
        WHEN amount <= 40 THEN 80
        WHEN amount <= 80 THEN 80
        WHEN amount <= 200 THEN 200
        ELSE 15
    END,
    product_limit = CASE 
        WHEN amount <= 5 THEN 50      -- $5用户获得50商品(提升)
        WHEN amount <= 15 THEN 50     -- $15用户保持50商品
        WHEN amount <= 40 THEN 200    -- $40用户获得200商品(提升)
        WHEN amount <= 80 THEN 200    -- $80用户保持200商品
        WHEN amount <= 200 THEN 500   -- $200用户保持500商品
        ELSE 50
    END,
    display_price = CASE 
        WHEN amount <= 5 THEN 15      -- 显示新价格
        WHEN amount <= 15 THEN 15
        WHEN amount <= 40 THEN 79     -- $40用户显示$79
        WHEN amount <= 80 THEN 79
        WHEN amount <= 200 THEN 199   -- $200用户显示$199
        ELSE 15
    END,
    currency = COALESCE(currency, 'USD')
WHERE subscription_type = 'seller';

-- 3.2 为从$5和$40迁移的用户标记首月折扣
UPDATE subscriptions 
SET 
    is_discounted = TRUE,
    discount_expiry_date = expires_at  -- 当前订阅周期内保持折扣价
WHERE subscription_type = 'seller' 
    AND amount IN (5, 40);

-- ============================================
-- Step 4: 同步 profiles 表
-- ============================================

-- 4.1 更新所有卖家用户的 product_limit 和 subscription_tier
UPDATE profiles p
SET 
    product_limit = s.product_limit,
    subscription_tier = s.subscription_tier
FROM subscriptions s
WHERE p.id = s.user_id
    AND s.subscription_type = 'seller'
    AND s.status = 'active'
    AND s.expires_at > NOW();

-- 4.2 标记直营卖家
UPDATE profiles 
SET seller_type = 'direct', product_limit = 999999
WHERE role = 'seller' 
    AND NOT EXISTS (
        SELECT 1 FROM subscriptions s 
        WHERE s.user_id = profiles.id 
        AND s.subscription_type = 'seller'
        AND s.status = 'active'
    );

-- ============================================
-- Step 5: 创建索引优化查询
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_type_status 
ON subscriptions(user_id, subscription_type, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tier 
ON subscriptions(subscription_tier) 
WHERE subscription_type = 'seller';

CREATE INDEX IF NOT EXISTS idx_profiles_seller_type 
ON profiles(seller_type) 
WHERE seller_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_product_limit 
ON profiles(product_limit);

-- ============================================
-- Step 6: 创建或更新 RPC 函数
-- ============================================

-- 6.1 创建函数: 获取用户商品数量限制
CREATE OR REPLACE FUNCTION get_user_product_limit(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_limit INTEGER;
    v_seller_type VARCHAR(20);
BEGIN
    -- 检查是否是直营卖家
    SELECT seller_type INTO v_seller_type
    FROM profiles
    WHERE id = p_user_id;
    
    IF v_seller_type = 'direct' THEN
        RETURN 999999; -- 直营卖家无限制
    END IF;
    
    -- 获取当前有效订阅的商品限制
    SELECT COALESCE(s.product_limit, 0) INTO v_limit
    FROM subscriptions s
    WHERE s.user_id = p_user_id
        AND s.subscription_type = 'seller'
        AND s.status = 'active'
        AND s.expires_at > NOW()
    ORDER BY s.subscription_tier DESC
    LIMIT 1;
    
    RETURN COALESCE(v_limit, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 创建函数: 检查用户是否可以创建商品
CREATE OR REPLACE FUNCTION can_create_product(p_user_id UUID)
RETURNS TABLE (
    can_create BOOLEAN,
    current_count INTEGER,
    product_limit INTEGER,
    remaining INTEGER
) AS $$
DECLARE
    v_limit INTEGER;
    v_current INTEGER;
BEGIN
    -- 获取商品限制
    v_limit := get_user_product_limit(p_user_id);
    
    -- 统计当前已上架商品数量
    SELECT COUNT(*) INTO v_current
    FROM products
    WHERE seller_id = p_user_id
        AND status = 'active';
    
    RETURN QUERY SELECT 
        (v_limit = 999999 OR v_current < v_limit),
        v_current,
        v_limit,
        GREATEST(v_limit - v_current, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.3 更新 sync_profile_subscription_derived 函数
CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- 从有效订阅中同步派生字段
    UPDATE profiles
    SET 
        subscription_type = (
            SELECT s.subscription_type
            FROM subscriptions s
            WHERE s.user_id = p_user_id
                AND s.status = 'active'
                AND s.expires_at > NOW()
            ORDER BY s.amount DESC
            LIMIT 1
        ),
        subscription_expires_at = (
            SELECT MAX(s.expires_at)
            FROM subscriptions s
            WHERE s.user_id = p_user_id
                AND s.status = 'active'
        ),
        subscription_tier = (
            SELECT s.subscription_tier
            FROM subscriptions s
            WHERE s.user_id = p_user_id
                AND s.subscription_type = 'seller'
                AND s.status = 'active'
                AND s.expires_at > NOW()
            ORDER BY s.subscription_tier DESC
            LIMIT 1
        ),
        product_limit = COALESCE((
            SELECT s.product_limit
            FROM subscriptions s
            WHERE s.user_id = p_user_id
                AND s.subscription_type = 'seller'
                AND s.status = 'active'
                AND s.expires_at > NOW()
            ORDER BY s.subscription_tier DESC
            LIMIT 1
        ), product_limit),
        role = CASE 
            WHEN EXISTS (
                SELECT 1 FROM subscriptions s
                WHERE s.user_id = p_user_id
                    AND s.subscription_type = 'seller'
                    AND s.status = 'active'
                    AND s.expires_at > NOW()
            ) THEN 'seller'
            ELSE role
        END
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 7: 创建触发器 - 订阅变更时自动同步
-- ============================================

-- 7.1 创建触发器函数
CREATE OR REPLACE FUNCTION trg_sync_profile_on_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM sync_profile_subscription_derived(NEW.user_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM sync_profile_subscription_derived(OLD.user_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 7.2 创建触发器
DROP TRIGGER IF EXISTS trg_subscription_change ON subscriptions;
CREATE TRIGGER trg_subscription_change
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION trg_sync_profile_on_subscription_change();

-- ============================================
-- Step 8: 验证迁移结果
-- ============================================

-- 8.1 统计各档位用户数量
SELECT 
    '迁移后档位分布' as check_item,
    subscription_tier as tier,
    COUNT(*) as user_count,
    SUM(CASE WHEN is_discounted THEN 1 ELSE 0 END) as discounted_count
FROM subscriptions
WHERE subscription_type = 'seller'
    AND status = 'active'
GROUP BY subscription_tier
ORDER BY subscription_tier;

-- 8.2 检查直营卖家
SELECT 
    '直营卖家数量' as check_item,
    COUNT(*) as count
FROM profiles
WHERE seller_type = 'direct';

-- 8.3 检查商品限制分布
SELECT 
    '商品限制分布' as check_item,
    product_limit,
    COUNT(*) as user_count
FROM profiles
WHERE product_limit > 0
GROUP BY product_limit
ORDER BY product_limit;

-- ============================================
-- 回滚脚本 (如需回滚,请执行以下SQL)
-- ============================================
/*
-- 回滚: 删除触发器
DROP TRIGGER IF EXISTS trg_subscription_change ON subscriptions;
DROP FUNCTION IF EXISTS trg_sync_profile_on_subscription_change();

-- 回滚: 删除函数
DROP FUNCTION IF EXISTS get_user_product_limit(UUID);
DROP FUNCTION IF EXISTS can_create_product(UUID);
DROP FUNCTION IF EXISTS sync_profile_subscription_derived(UUID);

-- 回滚: 删除索引
DROP INDEX IF EXISTS idx_subscriptions_user_type_status;
DROP INDEX IF EXISTS idx_subscriptions_tier;
DROP INDEX IF EXISTS idx_profiles_seller_type;
DROP INDEX IF EXISTS idx_profiles_product_limit;

-- 回滚: 删除字段 (谨慎操作!)
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS subscription_tier;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS display_price;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS product_limit;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS is_discounted;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS discount_expiry_date;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS deposit_credit;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS currency;

-- ALTER TABLE profiles DROP COLUMN IF EXISTS seller_type;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS product_limit;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_tier;
*/
