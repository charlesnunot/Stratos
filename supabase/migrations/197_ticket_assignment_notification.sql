-- Add notification trigger for ticket assignment changes
-- Notify the assigned staff member when a ticket is assigned to them

CREATE OR REPLACE FUNCTION create_ticket_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
  assigner_profile RECORD;
BEGIN
  -- Only fire when assigned_to changes and is not null
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    -- Don't notify if assigning to self
    IF NEW.assigned_to = auth.uid() THEN
      RETURN NEW;
    END IF;

    -- Get the assigner's profile
    SELECT display_name, username INTO assigner_profile
    FROM profiles
    WHERE id = auth.uid();

    -- Create notification for the assigned staff member (use content_key for i18n)
    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link,
        actor_id,
        content_key,
        content_params
      )
      VALUES (
        NEW.assigned_to,
        'system',
        'Ticket Assigned to You',
        COALESCE(assigner_profile.display_name, assigner_profile.username, 'Admin') || 
          ' assigned a ticket to you: ' || LEFT(NEW.title, 50),
        NEW.id,
        'support_ticket',
        '/admin/support',
        auth.uid(),
        'ticket_assigned',
        jsonb_build_object(
          'assignerName', COALESCE(assigner_profile.display_name, assigner_profile.username, 'Admin'),
          'ticketTitle', LEFT(NEW.title, 50)
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_ticket_assignment_notification: Failed to insert notification for user_id: %, error: %', 
          NEW.assigned_to, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for ticket assignment
DROP TRIGGER IF EXISTS trigger_create_ticket_assignment_notification ON support_tickets;
CREATE TRIGGER trigger_create_ticket_assignment_notification
  AFTER UPDATE OF assigned_to ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_assignment_notification();

COMMENT ON FUNCTION create_ticket_assignment_notification() IS 'Notify staff when a ticket is assigned to them (i18n via content_key)';
