-- 反向迁移：删除 v7.0 新架构（content_events + event_affiliate_binding）
-- 恢复使用旧架构（affiliate_posts）
-- 版本: v1.1

-- ============================================
-- 1. 删除触发器（必须先删除触发器，才能删除函数）
-- ============================================

-- 先查找并删除所有相关触发器
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN 
    SELECT trigger_name, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_name IN (
      'prevent_hard_delete_content_event',
      'prevent_hard_delete_event_affiliate_binding',
      'prevent_update_event_affiliate_binding',
      'trg_content_events_immutable',
      'trg_event_affiliate_binding_immutable',
      'block_hard_delete_content_event',
      'block_hard_delete_event_affiliate_binding'
    )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I CASCADE', trig.trigger_name, trig.event_object_table);
  END LOOP;
END $$;

-- ============================================
-- 2. 删除函数（使用 CASCADE 删除依赖对象）
-- ============================================

DROP FUNCTION IF EXISTS prevent_hard_delete_content_event() CASCADE;
DROP FUNCTION IF EXISTS prevent_hard_delete_event_affiliate_binding() CASCADE;
DROP FUNCTION IF EXISTS prevent_update_event_affiliate_binding() CASCADE;
DROP FUNCTION IF EXISTS create_content_event(UUID, TEXT, TEXT[], TEXT, TEXT, INTEGER, TEXT, UUID, JSONB) CASCADE;

-- ============================================
-- 3. 删除表（CASCADE 会自动删除相关的 RLS 策略和索引）
-- ============================================

DROP TABLE IF EXISTS event_affiliate_binding CASCADE;
DROP TABLE IF EXISTS content_events CASCADE;

-- ============================================
-- 4. 删除 affiliate_commissions 表中 v7.0 新增的字段
-- ============================================

ALTER TABLE affiliate_commissions
DROP COLUMN IF EXISTS event_id,
DROP COLUMN IF EXISTS fx_rate,
DROP COLUMN IF EXISTS fx_source_currency,
DROP COLUMN IF EXISTS fx_target_currency;

-- ============================================
-- 5. 删除 posts 表中 v7.0 新增的带货字段
-- ============================================

ALTER TABLE posts
DROP COLUMN IF EXISTS is_affiliate_post,
DROP COLUMN IF EXISTS affiliate_product_id,
DROP COLUMN IF EXISTS affiliate_seller_id,
DROP COLUMN IF EXISTS affiliate_commission_rate,
DROP COLUMN IF EXISTS content_source_id,
DROP COLUMN IF EXISTS content_source_type;

-- ============================================
-- 6. 删除索引（如果存在）
-- ============================================

DROP INDEX IF EXISTS idx_posts_is_affiliate;
DROP INDEX IF EXISTS idx_posts_affiliate_product;
DROP INDEX IF EXISTS idx_posts_content_source;
DROP INDEX IF EXISTS idx_content_events_creator_id;
DROP INDEX IF EXISTS idx_content_events_status;
DROP INDEX IF EXISTS idx_content_events_created_at;
DROP INDEX IF EXISTS idx_event_affiliate_binding_event_id;
DROP INDEX IF EXISTS idx_event_affiliate_binding_product_id;

-- ============================================
-- 7. 恢复 posts 表的 post_type 约束（移除 affiliate 类型）
-- ============================================

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_post_type_check
CHECK (post_type IN ('normal', 'image', 'text', 'story', 'music', 'short_video', 'series'));

-- ============================================
-- 完成
-- ============================================

-- 备注：
-- 1. affiliate_posts 表保留，用于追踪带货关系
-- 2. affiliate_commissions 表保留，用于记录佣金
-- 3. orders.affiliate_post_id 字段保留，用于关联订单来源
