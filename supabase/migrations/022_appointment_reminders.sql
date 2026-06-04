-- ============================================================
-- Automatic appointment reminders
-- ============================================================

ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS reminder_24h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reminder_2h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reminder_channel_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE appointment_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE appointment_notifications
  DROP CONSTRAINT IF EXISTS appointment_notifications_channel_check;

ALTER TABLE appointment_notifications
  ADD CONSTRAINT appointment_notifications_channel_check
  CHECK (channel IN ('email', 'telegram', 'whatsapp'));

ALTER TABLE appointment_notifications
  DROP CONSTRAINT IF EXISTS appointment_notifications_event_type_check;

ALTER TABLE appointment_notifications
  ADD CONSTRAINT appointment_notifications_event_type_check
  CHECK (
    event_type IN (
      'proposal_created',
      'confirmed',
      'updated',
      'cancelled',
      'completed',
      'reminder_24h',
      'reminder_2h'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_notifications_dedupe_key
  ON appointment_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
