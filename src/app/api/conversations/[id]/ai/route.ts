import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerAccountOwnerId } from "@/lib/auth/account";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const paused = body?.paused === true;
    const now = new Date().toISOString();

    const updates = paused
      ? {
          ai_paused: true,
          ai_paused_at: now,
          ai_paused_by: user.id,
          ai_pause_reason:
            typeof body?.reason === "string" && body.reason.trim()
              ? body.reason.trim()
              : "manual",
        }
      : {
          ai_paused: false,
          ai_paused_at: null,
          ai_paused_by: null,
          ai_pause_reason: null,
        };

    const { data, error } = await supabase
      .from("conversations")
      .update({ ...updates, updated_at: now })
      .eq("id", id)
      .eq("user_id", accountOwnerId)
      .select("id, ai_paused, ai_paused_at, ai_paused_by, ai_pause_reason, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    console.error("[conversations/ai] PATCH failed:", error);
    return NextResponse.json(
      { error: "Failed to update AI handoff state" },
      { status: 500 },
    );
  }
}
