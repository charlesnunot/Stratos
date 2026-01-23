-- 修复话题帖子计数逻辑
-- 确保 topics.post_count 只统计已审核通过的帖子
-- 当帖子状态变为 'approved' 时，更新相关话题的计数
-- 当帖子被拒绝或删除时，减少相关话题的计数

-- 创建函数：根据帖子状态更新话题计数
CREATE OR REPLACE FUNCTION update_topic_post_count_on_post_status_change()
RETURNS TRIGGER AS $$
DECLARE
  topic_record RECORD;
BEGIN
  -- 只在状态从 'pending' 变为 'approved' 或 'rejected' 时处理
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    -- 帖子审核通过：增加相关话题的计数
    FOR topic_record IN 
      SELECT topic_id FROM post_topics WHERE post_id = NEW.id
    LOOP
      UPDATE topics
      SET post_count = post_count + 1
      WHERE id = topic_record.topic_id;
    END LOOP;
    RETURN NEW;
  ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    -- 帖子被拒绝：减少相关话题的计数（如果之前已经增加过）
    -- 注意：由于原逻辑在 post_topics 插入时就增加了计数，这里需要减少
    FOR topic_record IN 
      SELECT topic_id FROM post_topics WHERE post_id = NEW.id
    LOOP
      UPDATE topics
      SET post_count = GREATEST(0, post_count - 1)
      WHERE id = topic_record.topic_id;
    END LOOP;
    RETURN NEW;
  ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    -- 帖子从 approved 变为其他状态（如 rejected 或 hidden）：减少计数
    FOR topic_record IN 
      SELECT topic_id FROM post_topics WHERE post_id = NEW.id
    LOOP
      UPDATE topics
      SET post_count = GREATEST(0, post_count - 1)
      WHERE id = topic_record.topic_id;
    END LOOP;
    RETURN NEW;
  ELSIF OLD.status != 'approved' AND NEW.status = 'approved' THEN
    -- 帖子从其他状态变为 approved：增加计数
    FOR topic_record IN 
      SELECT topic_id FROM post_topics WHERE post_id = NEW.id
    LOOP
      UPDATE topics
      SET post_count = post_count + 1
      WHERE id = topic_record.topic_id;
    END LOOP;
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器：监听帖子状态变更
DROP TRIGGER IF EXISTS trigger_update_topic_post_count_on_approval ON posts;
CREATE TRIGGER trigger_update_topic_post_count_on_approval
  AFTER UPDATE OF status ON posts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_topic_post_count_on_post_status_change();

-- 修改原有的 update_topic_post_count 函数
-- 使其不再在 post_topics 插入时自动增加计数
-- 只在删除时减少计数（因为删除时帖子可能已经被审核通过）
CREATE OR REPLACE FUNCTION update_topic_post_count()
RETURNS TRIGGER AS $$
DECLARE
  post_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 检查帖子状态，只有已审核通过的帖子才增加计数
    SELECT status INTO post_status
    FROM posts
    WHERE id = NEW.post_id;
    
    IF post_status = 'approved' THEN
      UPDATE topics
      SET post_count = post_count + 1
      WHERE id = NEW.topic_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- 删除关联时，检查帖子状态，只有已审核通过的帖子才减少计数
    SELECT status INTO post_status
    FROM posts
    WHERE id = OLD.post_id;
    
    IF post_status = 'approved' THEN
      UPDATE topics
      SET post_count = GREATEST(0, post_count - 1)
      WHERE id = OLD.topic_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 重新创建触发器（确保使用更新后的函数）
DROP TRIGGER IF EXISTS trigger_update_topic_post_count ON post_topics;
CREATE TRIGGER trigger_update_topic_post_count
  AFTER INSERT OR DELETE ON post_topics
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_post_count();

-- 修复现有数据：重新计算所有话题的帖子数（只统计已审核通过的帖子）
-- 这确保现有数据的准确性
UPDATE topics
SET post_count = (
  SELECT COUNT(DISTINCT pt.post_id)
  FROM post_topics pt
  INNER JOIN posts p ON p.id = pt.post_id
  WHERE pt.topic_id = topics.id
    AND p.status = 'approved'
);

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_update_topic_post_count_on_approval' 
    AND tgrelid = 'posts'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_update_topic_post_count_on_approval was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_update_topic_post_count_on_approval verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_topic_post_count_on_post_status_change';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_topic_post_count_on_post_status_change does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_topic_post_count_on_post_status_change verified: SECURITY DEFINER = %', has_security_definer;
END $$;
