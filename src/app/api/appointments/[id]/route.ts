import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerAccountOwnerId } from "@/lib/auth/account";

const VALID_STATUSES = new Set([
  "proposed",
  "confirmed",
  "cancelled",
  "completed",
]);

const EDITABLE_FIELDS = [
  "title",
  "appointment_type",
  "preferred_time",
  "scheduled_start",
  "scheduled_end",
  "timezone",
  "location",
  "notes",
] as const;

function cleanText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const update: Record<string, string | null> = {};

  if (typeof body?.status === "string") {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }

  for (const field of EDITABLE_FIELDS) {
    if (!(field in (body ?? {}))) continue;
    const value = cleanText(body[field]);
    if (value !== undefined) update[field] = value;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .eq("user_id", accountOwnerId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ appointment: data });
}
