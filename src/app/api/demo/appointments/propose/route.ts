import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/auth/server-permissions";
import { getServerAccountOwnerId } from "@/lib/auth/account";
import { queueAppointmentNotifications } from "@/lib/appointments/notifications";

const DEFAULT_APPOINTMENT_TIMEZONE =
  process.env.APPOINTMENT_DEFAULT_TIMEZONE?.trim() || "America/Santarem";

type LeadProfile = {
  name?: string;
  service?: string;
  need?: string;
  urgency?: string;
  budget?: string;
  nextAction?: string;
};

function cleanString(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function demoPhoneFor(service?: string) {
  const normalized = service?.toLowerCase() ?? "";
  if (normalized.includes("medic") || normalized.includes("clinic")) {
    return "+1555001001";
  }
  if (normalized.includes("abogado") || normalized.includes("legal")) {
    return "+1555002002";
  }
  return "+1555003003";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasPermission(supabase, user.id, "use_demo_tools"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);

  const body = await request.json().catch(() => null);
  const lead = (body?.lead_profile ?? {}) as LeadProfile;
  const contactId = cleanString(body?.contact_id);
  const appointmentType =
    cleanString(body?.appointment_type) ||
    (lead.service?.toLowerCase().includes("abogado")
      ? "Consulta legal"
      : lead.service?.toLowerCase().includes("medic")
        ? "Consulta medica"
        : "Consulta de seguimiento");
  const preferredTime = cleanString(body?.preferred_time) || "Por confirmar";
  const notes = cleanString(body?.notes) || lead.nextAction || lead.need || "";

  let contact: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null = null;

  if (contactId) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("id", contactId)
      .eq("user_id", accountOwnerId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contact = data;
  }

  if (!contact) {
    const phone = demoPhoneFor(lead.service);
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("user_id", accountOwnerId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      contact = existing;
    } else {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          user_id: accountOwnerId,
          phone,
          name: lead.name || "Lead demo",
          company: lead.service || "Demo",
        })
        .select("id, name, phone, email")
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Failed to create contact" },
          { status: 500 },
        );
      }
      contact = data;
    }
  }

  const noteText = [
    "[CITA PROPUESTA]",
    `Tipo: ${appointmentType}`,
    `Horario preferido: ${preferredTime}`,
    lead.urgency ? `Urgencia: ${lead.urgency}` : "",
    notes ? `Notas: ${notes}` : "",
    "",
    "Estado: Pendiente de confirmacion humana",
    "Siguiente paso: confirmar disponibilidad y crear evento en Google Calendar.",
  ]
    .filter(Boolean)
    .join("\n");

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      user_id: accountOwnerId,
      contact_id: contact.id,
      title: `${appointmentType} - ${contact.name ?? contact.phone ?? "Contacto"}`,
      appointment_type: appointmentType,
      status: "proposed",
      preferred_time: preferredTime,
      timezone: DEFAULT_APPOINTMENT_TIMEZONE,
      notes: notes || null,
      metadata: {
        source: "demo",
        urgency: lead.urgency ?? null,
        next_action: lead.nextAction ?? null,
      },
    })
    .select()
    .single();

  if (appointmentError || !appointment) {
    return NextResponse.json(
      {
        error:
          appointmentError?.message ?? "Failed to save appointment proposal",
      },
      { status: 500 },
    );
  }

  const { data: note, error: noteError } = await supabase
    .from("contact_notes")
    .insert({
      contact_id: contact.id,
      user_id: accountOwnerId,
      note_text: noteText,
    })
    .select()
    .single();

  if (noteError || !note) {
    return NextResponse.json(
      { error: noteError?.message ?? "Failed to save appointment proposal" },
      { status: 500 },
    );
  }

  await queueAppointmentNotifications({
    supabase,
    accountOwnerId,
    appointment: { ...appointment, contact },
    eventType: "proposal_created",
    actorUserId: user.id,
  });

  return NextResponse.json({ contact, note, appointment });
}
