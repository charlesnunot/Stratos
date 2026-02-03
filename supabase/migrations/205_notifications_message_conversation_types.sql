-- Add 'message' to notifications.type and 'conversation' to related_type
-- For chat message and retract notifications

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'order', 'commission', 'system', 'report', 'favorite', 'repost', 'share', 'want', 'message'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('post', 'order', 'user', 'product', 'report', 'comment', 'affiliate_post', 'tip', 'message', 'conversation') OR related_type IS NULL);
