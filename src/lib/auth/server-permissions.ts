import type { createClient } from "@/lib/supabase/server";
import { hasPermission, type AppPermission } from "@/lib/auth/roles";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function userHasPermission(
  supabase: SupabaseServerClient,
  userId: string,
  permission: AppPermission,
) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return hasPermission(data?.role, permission);
}
