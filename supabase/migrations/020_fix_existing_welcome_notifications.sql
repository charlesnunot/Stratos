-- 修复已存在的欢迎通知，添加 link 字段
-- 此脚本用于修复在迁移 018 和 019 执行之前创建的通知记录

UPDATE public.notifications
SET link = '/profile/' || related_id || '/edit'
WHERE type = 'system'
  AND related_type = 'user'
  AND title = '欢迎加入 Stratos！'
  AND (link IS NULL OR link = '');
