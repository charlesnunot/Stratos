-- Add ticket_type column to support_tickets (used by create form and list/detail pages)
-- Values: general, technical, billing, refund, other
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general'
    CHECK (ticket_type IN ('general', 'technical', 'billing', 'refund', 'other'));

-- Add UPDATE RLS policies for support_tickets
-- 1. Users can update own tickets (e.g.补充描述) - limited columns in app; admin/support need full update
-- 2. Admin/support can update any ticket (status, assigned_to, etc.)
-- 3. Assigned support can update tickets assigned to them (e.g. when replying, updated_at)

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Users can update own tickets') THEN
    CREATE POLICY "Users can update own tickets" ON support_tickets
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Admin and support can update all tickets') THEN
    CREATE POLICY "Admin and support can update all tickets" ON support_tickets
      FOR UPDATE
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
      );
  END IF;
END $$;

-- Assigned support can update tickets assigned to them (e.g. replying updates updated_at)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Assigned support can update assigned tickets') THEN
    CREATE POLICY "Assigned support can update assigned tickets" ON support_tickets
      FOR UPDATE
      USING (assigned_to = auth.uid())
      WITH CHECK (assigned_to = auth.uid());
  END IF;
END $$;
