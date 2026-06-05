-- ============================================================
-- Appointment availability settings
-- ============================================================

ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS availability_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  ADD COLUMN IF NOT EXISTS availability_start_time TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS availability_end_time TEXT NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (
    buffer_minutes BETWEEN 0 AND 240
  ),
  ADD COLUMN IF NOT EXISTS no_availability_message TEXT;

