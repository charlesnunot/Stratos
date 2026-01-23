-- 添加 seller_feedbacks 表的 RLS 策略

-- 启用 RLS
ALTER TABLE seller_feedbacks ENABLE ROW LEVEL SECURITY;

-- 任何人都可以查看卖家反馈（用于显示统计）
CREATE POLICY "Anyone can view seller feedbacks"
ON seller_feedbacks FOR SELECT
USING (true);

-- 买家可以创建自己的反馈
CREATE POLICY "Buyers can create their own feedback"
ON seller_feedbacks FOR INSERT
WITH CHECK (auth.uid() = buyer_id);

-- 买家可以更新自己的反馈
CREATE POLICY "Buyers can update their own feedback"
ON seller_feedbacks FOR UPDATE
USING (auth.uid() = buyer_id);

-- 买家可以删除自己的反馈（可选，根据业务需求）
CREATE POLICY "Buyers can delete their own feedback"
ON seller_feedbacks FOR DELETE
USING (auth.uid() = buyer_id);
