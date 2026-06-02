-- ============================================================
-- Appointment notification queue
-- ============================================================
-- Stores internal email notification intents for appointment lifecycle
-- events. SMTP delivery is intentionally added later; for now this
-- gives the CRM a durable queue/history without external dependencies.

CREATE TABLE IF NOT EXISTS appointment_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('client', 'staff')),
  recipient_email TEXT,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'proposal_created',
      'confirmed',
      'updated',
      'cancelled',
      'completed'
    )
  ),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  ics_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'skipped', 'sent', 'failed')
  ),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_notifications_user_status
  ON appointment_notifications(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_notifications_appointment
  ON appointment_notifications(appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_notifications_contact
  ON appointment_notifications(contact_id, created_at DESC);

ALTER TABLE appointment_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can manage appointment notifications"
  ON appointment_notifications;

CREATE POLICY "Account users can manage appointment notifications"
  ON appointment_notifications
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP TRIGGER IF EXISTS set_updated_at ON appointment_notifications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON appointment_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
