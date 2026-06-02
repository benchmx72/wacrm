import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerAccountOwnerId } from "@/lib/auth/account";
import {
  queueAppointmentNotifications,
  type AppointmentNotificationEvent,
} from "@/lib/appointments/notifications";

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

function inferNotificationEvent(
  before: { status?: string; scheduled_start?: string | null; scheduled_end?: string | null },
  after: { status?: string; scheduled_start?: string | null; scheduled_end?: string | null },
): AppointmentNotificationEvent {
  if (before.status !== after.status) {
    if (after.status === "confirmed") return "confirmed";
    if (after.status === "cancelled") return "cancelled";
    if (after.status === "completed") return "completed";
  }

  if (
    before.scheduled_start !== after.scheduled_start ||
    before.scheduled_end !== after.scheduled_end
  ) {
    return "updated";
  }

  return "updated";
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

  const { data: existing, error: existingError } = await supabase
    .from("appointments")
    .select("id, status, scheduled_start, scheduled_end")
    .eq("id", id)
    .eq("user_id", accountOwnerId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .eq("user_id", accountOwnerId)
    .select("*, contact:contacts(name, phone, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await queueAppointmentNotifications({
    supabase,
    accountOwnerId,
    appointment: data,
    eventType: inferNotificationEvent(existing, data),
    actorUserId: user.id,
  });

  return NextResponse.json({ appointment: data });
}
