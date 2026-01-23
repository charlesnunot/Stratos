-- Ensure notifications.related_type_check includes 'comment'
-- (Idempotent safety net; some environments may have older constraints.)

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_related_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_related_type_check
  CHECK (
    related_type IN (
      'post',
      'order',
      'user',
      'product',
      'report',
      'comment',
      'affiliate_post',
      'tip',
      'message'
    )
    OR related_type IS NULL
  );

