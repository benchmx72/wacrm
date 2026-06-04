-- ============================================================
-- Customer appointment change requests
-- ============================================================
-- The AI agent may capture a customer's intent to cancel or
-- reschedule, but a staff member must approve the change.

CREATE TABLE IF NOT EXISTS appointment_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('cancel', 'reschedule')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_text TEXT NOT NULL,
  requested_time TEXT,
  source TEXT NOT NULL DEFAULT 'customer_message',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_change_requests_user_status
  ON appointment_change_requests(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_change_requests_appointment
  ON appointment_change_requests(appointment_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_change_requests_pending_unique
  ON appointment_change_requests(appointment_id, request_type)
  WHERE status = 'pending';

ALTER TABLE appointment_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can manage appointment change requests"
  ON appointment_change_requests;

CREATE POLICY "Account users can manage appointment change requests"
  ON appointment_change_requests
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP TRIGGER IF EXISTS set_updated_at ON appointment_change_requests;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON appointment_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
