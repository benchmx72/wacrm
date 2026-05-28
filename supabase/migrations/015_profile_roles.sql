-- ============================================================
-- Application roles
-- ============================================================
-- super_admin: internal owner/demo account.
-- client_admin: client-side administrator for a tenant/account.
-- staff: operators focused on inbox/contact handling.
-- viewer: read-only/light supervision role for future use.

UPDATE profiles
SET role = 'super_admin'
WHERE role IS NULL OR role IN ('user', 'owner');

UPDATE profiles
SET role = 'client_admin'
WHERE role = 'admin';

UPDATE profiles
SET role = 'staff'
WHERE role = 'agent';

UPDATE profiles
SET role = 'viewer'
WHERE role = 'read_only';

ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'client_admin';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'client_admin', 'staff', 'viewer'));

CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Role changes must be made by a privileged server action';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_self_update ON profiles;

CREATE TRIGGER prevent_profile_role_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_self_update();
