-- products: 销售国家/地区（主要国家）
ALTER TABLE products
ADD COLUMN IF NOT EXISTS sales_countries TEXT[] DEFAULT '{}';

COMMENT ON COLUMN products.sales_countries IS '商品可销售的主要国家 ISO 3166-1 alpha-2 代码，空数组表示未限制';

-- 兼容旧数据：NULL 视为空数组
UPDATE products SET sales_countries = COALESCE(sales_countries, '{}') WHERE sales_countries IS NULL;