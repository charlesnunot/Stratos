-- 移除follows表中的is_favorite字段和相关功能
-- 简化关注系统，只保留普通关注功能

-- 1. 删除特别关注通知触发器
DROP TRIGGER IF EXISTS trigger_create_favorite_user_notification ON follows;

-- 2. 删除特别关注通知函数
DROP FUNCTION IF EXISTS create_favorite_user_notification();

-- 3. 删除索引
DROP INDEX IF EXISTS idx_follows_is_favorite;

-- 4. 删除 is_favorite 字段
ALTER TABLE follows 
DROP COLUMN IF EXISTS is_favorite;
