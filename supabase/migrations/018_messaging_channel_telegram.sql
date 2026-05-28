-- ============================================================
-- Account messaging channel and Telegram configuration
-- ============================================================
-- Each CRM account chooses one customer messaging platform. WhatsApp
-- remains the default for existing accounts; Telegram is the lower-cost
-- option for clients that do not need Meta/WhatsApp Cloud API.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS messaging_channel TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_messaging_channel_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_messaging_channel_check
  CHECK (messaging_channel IN ('whatsapp', 'telegram'));

UPDATE profiles
SET messaging_channel = 'whatsapp'
WHERE messaging_channel IS NULL;

CREATE TABLE IF NOT EXISTS telegram_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL,
  bot_username TEXT,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_config_user_id
  ON telegram_config(user_id);

ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can manage telegram config" ON telegram_config;
CREATE POLICY "Account users can manage telegram config" ON telegram_config
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP TRIGGER IF EXISTS set_updated_at ON telegram_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON telegram_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
