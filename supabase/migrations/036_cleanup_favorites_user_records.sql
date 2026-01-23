-- 清理favorites表中item_type='user'的记录
-- 注意：此迁移是可选的，建议在确认数据迁移成功后再执行
-- 执行此迁移前，请确保：
-- 1. 迁移034_add_is_favorite_to_follows.sql已成功执行
-- 2. 所有item_type='user'的记录已正确迁移到follows表
-- 3. 应用程序已更新为使用follows表处理用户特别关注

-- 可选：先备份数据（如果需要）
-- CREATE TABLE favorites_user_backup AS 
-- SELECT * FROM favorites WHERE item_type = 'user';

-- 删除favorites表中item_type='user'的记录
-- 注意：取消注释下面的DELETE语句来执行清理
-- DELETE FROM favorites WHERE item_type = 'user';

-- 验证清理结果（可选）
-- SELECT COUNT(*) as remaining_user_favorites FROM favorites WHERE item_type = 'user';
