-- 将已有话题中「slug 含非 ASCII 且 name_translated 存在」的条目，统一为规范 ASCII slug（与 toCanonicalSlug 一致）
-- 便于中英文页面跳转到同一可读链接，如 /topics/pet-lost

WITH base AS (
  SELECT
    id,
    trim(both '-' FROM regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(name_translated)), '\s+', '-', 'g'),
        '[^a-z0-9-]', '', 'g'
      ),
      '-+', '-', 'g'
    )) AS new_slug
  FROM topics
  WHERE name_translated IS NOT NULL
    AND trim(name_translated) <> ''
    AND slug ~ '[^\x00-\x7F]'
),
ranked AS (
  SELECT id, new_slug,
    row_number() OVER (PARTITION BY new_slug ORDER BY id) AS rn
  FROM base
  WHERE new_slug <> ''
),
final_slug AS (
  SELECT r.id,
    CASE
      WHEN r.rn > 1 THEN r.new_slug || '-' || left(t.id::text, 8)
      WHEN EXISTS (SELECT 1 FROM topics t2 WHERE t2.id <> t.id AND t2.slug = r.new_slug) THEN r.new_slug || '-' || left(t.id::text, 8)
      ELSE r.new_slug
    END AS slug
  FROM ranked r
  JOIN topics t ON t.id = r.id
)
UPDATE topics t
SET slug = f.slug
FROM final_slug f
WHERE t.id = f.id;

COMMENT ON TABLE topics IS '话题 slug 为规范 ASCII 便于中英文统一 URL';
