-- Extend messages.message_type to support 'post'
-- Adds 'post' to the CHECK constraint while keeping existing values.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'product', 'post', 'system'));

