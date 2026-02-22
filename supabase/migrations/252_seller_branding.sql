-- Migration: Seller Branding System
-- Description: Custom branding for Scale tier sellers
-- Tier: Scale ($100) only

-- 1. 创建卖家品牌配置表
CREATE TABLE IF NOT EXISTS seller_branding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 品牌信息
  brand_name TEXT,
  brand_description TEXT,
  brand_logo_url TEXT,
  brand_favicon_url TEXT,
  
  -- 颜色配置
  primary_color TEXT DEFAULT '#3B82F6', -- 主色调
  secondary_color TEXT DEFAULT '#10B981', -- 次色调
  accent_color TEXT DEFAULT '#F59E0B', -- 强调色
  background_color TEXT DEFAULT '#FFFFFF', -- 背景色
  text_color TEXT DEFAULT '#1F2937', -- 文字颜色
  
  -- 字体配置
  heading_font TEXT DEFAULT 'system-ui',
  body_font TEXT DEFAULT 'system-ui',
  
  -- 自定义CSS
  custom_css TEXT,
  
  -- 店铺页面配置
  hero_image_url TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  show_social_links BOOLEAN DEFAULT true,
  show_contact_info BOOLEAN DEFAULT true,
  
  -- 社交媒体链接
  website_url TEXT,
  instagram_url TEXT,
  twitter_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,
  
  -- 联系方式
  contact_email TEXT,
  contact_phone TEXT,
  business_hours TEXT,
  
  -- 状态
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(seller_id)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_seller_branding_seller_id ON seller_branding(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_branding_published ON seller_branding(is_published) WHERE is_published = true;

-- 3. 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_seller_branding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_seller_branding_timestamp ON seller_branding;
CREATE TRIGGER update_seller_branding_timestamp
  BEFORE UPDATE ON seller_branding
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_branding_timestamp();

-- 4. 创建视图：公开的品牌信息
CREATE OR REPLACE VIEW public_seller_branding AS
SELECT 
  sb.seller_id,
  sb.brand_name,
  sb.brand_description,
  sb.brand_logo_url,
  sb.primary_color,
  sb.secondary_color,
  sb.accent_color,
  sb.background_color,
  sb.text_color,
  sb.heading_font,
  sb.body_font,
  sb.hero_image_url,
  sb.hero_title,
  sb.hero_subtitle,
  sb.show_social_links,
  sb.show_contact_info,
  sb.website_url,
  sb.instagram_url,
  sb.twitter_url,
  sb.facebook_url,
  sb.youtube_url,
  sb.contact_email,
  sb.contact_phone,
  sb.business_hours,
  sb.is_published,
  p.username as seller_username,
  p.display_name as seller_display_name,
  p.avatar_url as seller_avatar_url
FROM seller_branding sb
JOIN profiles p ON p.id = sb.seller_id
WHERE sb.is_published = true AND sb.is_active = true;

-- 5. 添加RLS策略
ALTER TABLE seller_branding ENABLE ROW LEVEL SECURITY;

-- 卖家可以查看自己的品牌配置
CREATE POLICY " sellers_can_view_own_branding"
  ON seller_branding
  FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

-- 卖家可以更新自己的品牌配置
CREATE POLICY "sellers_can_update_own_branding"
  ON seller_branding
  FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid());

-- 卖家可以插入自己的品牌配置
CREATE POLICY "sellers_can_insert_own_branding"
  ON seller_branding
  FOR INSERT
  TO authenticated
  WITH CHECK (seller_id = auth.uid());

-- 公开访问已发布的品牌
CREATE POLICY "public_can_view_published_branding"
  ON seller_branding
  FOR SELECT
  TO anon
  USING (is_published = true AND is_active = true);

-- 6. 创建函数：检查品牌功能权限（Scale档位）
CREATE OR REPLACE FUNCTION can_use_branding(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_seller_type TEXT;
  v_subscription_tier INTEGER;
BEGIN
  -- 检查卖家类型
  SELECT seller_type INTO v_seller_type
  FROM profiles
  WHERE id = p_user_id;
  
  -- 直营卖家可以使用
  IF v_seller_type = 'direct' THEN
    RETURN true;
  END IF;
  
  -- 检查订阅档位
  SELECT subscription_tier INTO v_subscription_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY expires_at DESC
  LIMIT 1;
  
  -- Scale档位(100)可以使用
  RETURN COALESCE(v_subscription_tier, 0) >= 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 添加注释
COMMENT ON TABLE seller_branding IS '卖家品牌配置表 - Scale档位功能';
COMMENT ON COLUMN seller_branding.custom_css IS '自定义CSS样式，需谨慎使用';
COMMENT ON COLUMN seller_branding.is_published IS '是否公开显示品牌页面';
