-- Add content_key and content_params for notification content i18n.
-- Frontend resolves content_key + content_params with current locale; content remains for legacy/fallback.

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS content_key TEXT,
ADD COLUMN IF NOT EXISTS content_params JSONB;

COMMENT ON COLUMN public.notifications.content_key IS 'Message key for i18n (e.g. comment_on_post). Resolved with notifications.content.* in en/zh.';
COMMENT ON COLUMN public.notifications.content_params IS 'JSON params for message (e.g. actorName, productName). Passed to next-intl t().';

CREATE INDEX IF NOT EXISTS idx_notifications_content_key ON public.notifications(content_key) WHERE content_key IS NOT NULL;
