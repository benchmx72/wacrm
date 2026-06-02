-- Allow the SMTP worker to claim rows before delivery so overlapping
-- cron/manual runs do not send the same appointment email twice.

ALTER TABLE appointment_notifications
  DROP CONSTRAINT IF EXISTS appointment_notifications_status_check;

ALTER TABLE appointment_notifications
  ADD CONSTRAINT appointment_notifications_status_check
  CHECK (status IN ('pending', 'sending', 'skipped', 'sent', 'failed'));
