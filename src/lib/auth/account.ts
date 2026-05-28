import type { createClient as createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

export async function getClientAccountOwnerId(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select("account_owner_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.account_owner_id ?? userId;
}

export async function getServerAccountOwnerId(
  supabase: ServerSupabase,
  userId: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select("account_owner_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.account_owner_id ?? userId;
}
