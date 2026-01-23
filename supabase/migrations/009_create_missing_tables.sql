-- 创建 support_ticket_replies 表
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 affiliate_posts 表（关联帖子和商品的带货关系）
CREATE TABLE IF NOT EXISTS affiliate_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  affiliate_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, product_id)
);

-- 创建 affiliate_commissions 表（佣金记录）
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_id ON support_ticket_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_user_id ON support_ticket_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_posts_post_id ON affiliate_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_posts_product_id ON affiliate_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_posts_affiliate_id ON affiliate_posts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_order_id ON affiliate_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);

-- 启用 RLS
ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for support_ticket_replies
CREATE POLICY "Users can view ticket replies" ON support_ticket_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE id = support_ticket_replies.ticket_id 
      AND (user_id = auth.uid() OR assigned_to = auth.uid())
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

CREATE POLICY "Users can create ticket replies" ON support_ticket_replies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE id = support_ticket_replies.ticket_id 
      AND (user_id = auth.uid() OR assigned_to = auth.uid())
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- RLS Policies for affiliate_posts
CREATE POLICY "Users can view affiliate posts" ON affiliate_posts
  FOR SELECT USING (true);

CREATE POLICY "Affiliates can create affiliate posts" ON affiliate_posts
  FOR INSERT WITH CHECK (
    auth.uid() = affiliate_id AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND subscription_type = 'affiliate'
    )
  );

-- RLS Policies for affiliate_commissions
CREATE POLICY "Users can view own commissions" ON affiliate_commissions
  FOR SELECT USING (
    affiliate_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );
