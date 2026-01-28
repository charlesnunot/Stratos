-- RPC: 按内容汇总 PV/UV（供创作者/卖家看板使用）
-- 仅能查询 owner_id = auth.uid() 的数据（RLS 由调用方保证）

CREATE OR REPLACE FUNCTION get_view_summary(
  p_owner_id UUID,
  p_entity_type TEXT,
  p_days INT DEFAULT 30
)
RETURNS TABLE (entity_id UUID, pv BIGINT, uv BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ve.entity_id,
    count(*)::BIGINT AS pv,
    count(DISTINCT coalesce(ve.viewer_id::TEXT, ve.session_id))::BIGINT AS uv
  FROM view_events ve
  WHERE ve.owner_id = p_owner_id
    AND ve.entity_type = p_entity_type
    AND ve.viewed_at >= (now() - (p_days || ' days')::INTERVAL)
  GROUP BY ve.entity_id
  ORDER BY pv DESC;
$$;

COMMENT ON FUNCTION get_view_summary IS 'PV/UV summary per entity for analytics dashboard; caller must pass owner_id = auth.uid()';
