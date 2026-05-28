-- ============================================================
-- Team/account ownership fields
-- ============================================================
-- account_owner_id groups client admins/staff/viewers under one CRM
-- account. Existing users become the owner of their own account.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'disabled'));

UPDATE profiles
SET account_owner_id = user_id
WHERE account_owner_id IS NULL;

ALTER TABLE profiles
  ALTER COLUMN account_owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_account_owner_id
  ON profiles(account_owner_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    account_owner_id,
    full_name,
    email,
    role,
    status
  )
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client_admin'),
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
