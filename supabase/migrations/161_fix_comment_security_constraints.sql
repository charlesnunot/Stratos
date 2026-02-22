-- Fix comment system security issues
-- ✅ 修复 P0-5, P0-6, P0-7, P0-9, P0-8

-- ============================================
-- 1. P0-5: 添加嵌套深度约束（最多 2 层）
-- ============================================

CREATE OR REPLACE FUNCTION check_comment_depth()
RETURNS TRIGGER AS $$
DECLARE
  current_depth INT := 0;
  current_parent_id UUID := NEW.parent_id;
BEGIN
  -- 如果有 parent_id，计算深度
  WHILE current_parent_id IS NOT NULL LOOP
    current_depth := current_depth + 1;
    IF current_depth >= 2 THEN
      RAISE EXCEPTION '评论嵌套深度不能超过 2 层';
    END IF;
    SELECT parent_id INTO current_parent_id
    FROM comments
    WHERE id = current_parent_id;
    
    -- 防止无限循环（理论上不应该发生，但安全起见）
    IF current_depth > 10 THEN
      RAISE EXCEPTION '评论嵌套结构异常';
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_comment_depth_trigger ON comments;
CREATE TRIGGER check_comment_depth_trigger
BEFORE INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION check_comment_depth();

COMMENT ON FUNCTION check_comment_depth() IS '检查评论嵌套深度，确保不超过 2 层';

-- ============================================
-- 2. P0-6: 验证跨 post 回复（parent_id 必须属于同一个 post_id）
-- ============================================

CREATE OR REPLACE FUNCTION validate_comment_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM comments
      WHERE id = NEW.parent_id
      AND post_id = NEW.post_id
    ) THEN
      RAISE EXCEPTION '父评论必须属于同一个帖子';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validate_comment_parent_trigger ON comments;
CREATE TRIGGER validate_comment_parent_trigger
BEFORE INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION validate_comment_parent();

COMMENT ON FUNCTION validate_comment_parent() IS '验证回复评论的 parent_id 必须属于同一个 post_id';

-- ============================================
-- 3. P0-7: 删除评论时级联处理子评论（将子评论的 parent_id 设置为 NULL）
-- ============================================

CREATE OR REPLACE FUNCTION handle_comment_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- 将子评论的 parent_id 设置为 NULL（使其变成一级评论）
  UPDATE comments
  SET parent_id = NULL
  WHERE parent_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS handle_comment_delete_trigger ON comments;
CREATE TRIGGER handle_comment_delete_trigger
AFTER DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION handle_comment_delete();

COMMENT ON FUNCTION handle_comment_delete() IS '删除评论时，将子评论的 parent_id 设置为 NULL，使其变成一级评论';

-- ============================================
-- 4. P0-9: 更新 RLS 策略，验证帖子可见性
-- ============================================

DROP POLICY IF EXISTS "Users can view approved comments from active users" ON comments;
DROP POLICY IF EXISTS "Users can view approved comments from active users on visible posts" ON comments;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Users can view approved comments from active users on visible posts') THEN
    CREATE POLICY "Users can view approved comments from active users on visible posts"
    ON comments FOR SELECT
    USING (
      (
        status = 'approved' AND 
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = comments.user_id 
          AND profiles.status = 'active'
        ) AND
        EXISTS (
          SELECT 1 FROM posts
          WHERE posts.id = comments.post_id
          AND posts.status = 'approved'
        )
      ) OR
      user_id = auth.uid() OR 
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'support')
      )
    );
  END IF;
END $$;

COMMENT ON POLICY "Users can view approved comments from active users on visible posts" ON comments 
IS '只能查看可见帖子（status=approved）下的已审核评论，且评论作者必须是活跃用户';

-- ============================================
-- 5. P0-8: 更新删除评论权限，允许帖子作者删除自己帖子下的评论
-- ============================================

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Users can delete own comments or post authors can delete comments on their posts') THEN
    CREATE POLICY "Users can delete own comments or post authors can delete comments on their posts"
    ON comments FOR DELETE
    USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = comments.post_id
        AND posts.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'support')
      )
    );
  END IF;
END $$;

COMMENT ON POLICY "Users can delete own comments or post authors can delete comments on their posts" ON comments 
IS '允许评论作者、帖子作者或管理员删除评论';

-- ============================================
-- 6. P1-2 & P1-5: 添加评论数自动更新触发器
-- ============================================

-- 创建更新帖子评论数的函数
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    UPDATE posts
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE posts
    SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 如果状态从非 approved 变为 approved，+1
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE posts
      SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = NEW.post_id;
    -- 如果状态从 approved 变为非 approved，-1
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE posts
      SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
      WHERE id = NEW.post_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_post_comment_count_trigger ON comments;
CREATE TRIGGER update_post_comment_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

COMMENT ON FUNCTION update_post_comment_count() IS '自动更新帖子的评论数（comment_count）';

-- ============================================
-- 7. P0-10: 添加评论内容审核检查（新评论默认 pending，除非是管理员）
-- ============================================

CREATE OR REPLACE FUNCTION set_comment_status_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- 如果用户是管理员或支持人员，直接批准
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = NEW.user_id
    AND profiles.role IN ('admin', 'support')
  ) THEN
    NEW.status := 'approved';
  -- 否则默认 pending，等待审核
  ELSIF NEW.status IS NULL OR NEW.status = 'approved' THEN
    NEW.status := 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_comment_status_on_insert_trigger ON comments;
CREATE TRIGGER set_comment_status_on_insert_trigger
BEFORE INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION set_comment_status_on_insert();

COMMENT ON FUNCTION set_comment_status_on_insert() IS '新评论默认状态为 pending，除非是管理员';
