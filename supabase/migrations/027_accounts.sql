-- ============================================================
-- Formal CRM client accounts
-- ============================================================
-- profiles.account_owner_id remains the tenant key used by existing
-- tables. This registry adds the business metadata required by the
-- Super Admin client center without changing tenant ownership.

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'active', 'suspended')),
  locale TEXT NOT NULL DEFAULT 'es-419'
    CHECK (locale IN ('es-419', 'pt-BR')),
  timezone TEXT NOT NULL DEFAULT 'America/Santarem',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at DESC);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can view own account" ON accounts;
CREATE POLICY "Account users can view own account" ON accounts
  FOR SELECT
  USING (owner_user_id = public.current_account_owner_id());

DROP TRIGGER IF EXISTS set_updated_at ON accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Register every existing tenant owner. Service-role APIs can later
-- enrich these records during the guided client onboarding flow.
INSERT INTO accounts (
  owner_user_id,
  name,
  status,
  locale,
  timezone,
  created_at,
  updated_at
)
SELECT
  p.user_id,
  COALESCE(NULLIF(BTRIM(p.full_name), ''), NULLIF(BTRIM(p.email), ''), 'Cuenta CRM'),
  CASE WHEN p.status = 'disabled' THEN 'suspended' ELSE 'active' END,
  'es-419',
  'America/Santarem',
  COALESCE(p.created_at, NOW()),
  NOW()
FROM profiles p
WHERE p.user_id = p.account_owner_id
  AND p.role <> 'super_admin'
ON CONFLICT (owner_user_id) DO NOTHING;
