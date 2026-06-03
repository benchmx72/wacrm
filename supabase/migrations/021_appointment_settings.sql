CREATE TABLE IF NOT EXISTS appointment_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_timezone TEXT NOT NULL DEFAULT 'America/Santarem',
  default_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (
    default_duration_minutes BETWEEN 5 AND 480
  ),
  default_location TEXT,
  staff_notification_email TEXT,
  notify_client BOOLEAN NOT NULL DEFAULT TRUE,
  notify_staff BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can manage appointment settings"
  ON appointment_settings;

CREATE POLICY "Account users can manage appointment settings"
  ON appointment_settings
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP TRIGGER IF EXISTS set_updated_at ON appointment_settings;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON appointment_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
