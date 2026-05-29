"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientAccountOwnerId } from "@/lib/auth/account";
import type { Appointment, Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  CalendarPlus,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ContactSidebarProps {
  contact: Contact | null;
  canUseDemoTools?: boolean;
}

interface SidebarSectionProps {
  title: string;
  icon: typeof TagIcon;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

function SidebarSection({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  children,
}: SidebarSectionProps) {
  return (
    <details
      open={defaultOpen}
      className="group border-t border-slate-800 pt-4 first:border-t-0 first:pt-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-300">
        <span className="flex items-center gap-2">
          <Icon className="h-3 w-3" />
          {title}
          {typeof count === "number" && count > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              {count}
            </span>
          ) : null}
        </span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function ContactSidebar({
  contact,
  canUseDemoTools = false,
}: ContactSidebarProps) {
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [leadFields, setLeadFields] = useState<{
    realPhone?: string;
    intent?: string;
  }>({});
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [proposingAppointment, setProposingAppointment] = useState(false);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<
    string | null
  >(null);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, appointments, notes, tags, and captured lead fields in parallel
    const [dealsRes, appointmentsRes, notesRes, tagsRes, fieldsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("contact_custom_values")
        .select("value, custom_fields(field_name)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (appointmentsRes.data) setAppointments(appointmentsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (fieldsRes.data) {
      const captured: { realPhone?: string; intent?: string } = {};
      for (const row of fieldsRes.data as Array<{
        value?: string | null;
        custom_fields?: { field_name?: string | null } | null;
      }>) {
        if (row.custom_fields?.field_name === "telefono_real") {
          captured.realPhone = row.value ?? "";
        }
        if (row.custom_fields?.field_name === "intencion_lead") {
          captured.intent = row.value ?? "";
        }
      }
      setLeadFields(captured);
    } else {
      setLeadFields({});
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    const accountOwnerId = await getClientAccountOwnerId(supabase, user.id);

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        user_id: accountOwnerId,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote]);

  const handleProposeAppointment = useCallback(async () => {
    if (!contact || proposingAppointment) return;
    setProposingAppointment(true);
    const res = await fetch("/api/demo/appointments/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contact.id,
        appointment_type: "Consulta de seguimiento",
        preferred_time: "Por confirmar",
        notes: "Propuesta desde Inbox. Confirmar disponibilidad antes de agendar.",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.note) {
      setNotes((prev) => [data.note, ...prev]);
      if (data.appointment) {
        setAppointments((prev) => [data.appointment, ...prev]);
      }
    }
    setProposingAppointment(false);
  }, [contact, proposingAppointment]);

  const updateAppointmentStatus = useCallback(
    async (appointmentId: string, status: Appointment["status"]) => {
      if (updatingAppointmentId) return;
      setUpdatingAppointmentId(appointmentId);
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.appointment) {
        setAppointments((prev) =>
          prev.map((appointment) =>
            appointment.id === appointmentId ? data.appointment : appointment,
          ),
        );
      }
      setUpdatingAppointmentId(null);
    },
    [updatingAppointmentId],
  );

  if (!contact) {
    return (
      <div className="flex h-full min-h-0 w-70 items-center justify-center border-l border-slate-800 bg-slate-900">
        <p className="text-sm text-slate-500">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const isTelegramContact = contact.phone.startsWith("tg:");
  const statusLabels: Record<Appointment["status"], string> = {
    proposed: "Propuesta",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    completed: "Completada",
  };

  return (
    <div className="flex h-full min-h-0 w-70 flex-col border-l border-slate-800 bg-slate-900">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-lg font-semibold text-white">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-slate-400">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              <Phone className="h-4 w-4 text-slate-500" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-slate-600" />
              )}
            </button>

            {isTelegramContact && leadFields.realPhone && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300">
                <Phone className="h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate">{leadFields.realPhone}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">
                    Telefono real
                  </p>
                </div>
              </div>
            )}

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300">
                <Mail className="h-4 w-4 text-slate-500" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {leadFields.intent && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300">
                <ClipboardCheck className="h-4 w-4 text-slate-500" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="capitalize">{leadFields.intent}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">
                    Intencion
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-slate-800" />

          {canUseDemoTools && (
            <>
              <Button
                type="button"
                onClick={handleProposeAppointment}
                disabled={proposingAppointment}
                className="w-full"
              >
                <CalendarPlus className="h-4 w-4" />
                {proposingAppointment ? "Guardando cita..." : "Proponer cita"}
              </Button>

              {/* Divider */}
              <div className="my-4 border-t border-slate-800" />
            </>
          )}

          <SidebarSection title="Tags" icon={TagIcon} count={tags.length}>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">No tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </SidebarSection>

          {/* Divider */}
          <div className="my-4 border-t border-slate-800" />

          <SidebarSection title="Negocios activos" icon={DollarSign} count={deals.length}>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">No deals</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-slate-800 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-white">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SidebarSection>

          {/* Divider */}
          <div className="hidden" />

          <SidebarSection title="Citas" icon={CalendarPlus} count={appointments.length}>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {appointments.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">Sin citas</p>
              ) : (
                appointments.map((appointment, index) => (
                  <details
                    open={index === 0}
                    key={appointment.id}
                    className="group rounded-lg bg-slate-800 px-3 py-2"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
                      <p className="text-xs font-medium text-white">
                        {appointment.title}
                      </p>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {statusLabels[appointment.status]}
                        </span>
                        <ChevronDown className="h-3 w-3 text-slate-500 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="mt-2">
                      <p className="text-xs text-slate-400">
                        {appointment.preferred_time ?? "Por confirmar"}
                      </p>
                      {appointment.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">
                          {appointment.notes}
                        </p>
                      )}
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={
                            updatingAppointmentId === appointment.id ||
                            appointment.status === "confirmed"
                          }
                          onClick={() =>
                            updateAppointmentStatus(appointment.id, "confirmed")
                          }
                          className="h-7 px-1 text-[10px] text-primary hover:bg-primary/10 hover:text-primary"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Confirmar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={
                            updatingAppointmentId === appointment.id ||
                            appointment.status === "completed"
                          }
                          onClick={() =>
                            updateAppointmentStatus(appointment.id, "completed")
                          }
                          className="h-7 px-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white"
                        >
                          <ClipboardCheck className="h-3 w-3" />
                          Completar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={
                            updatingAppointmentId === appointment.id ||
                            appointment.status === "cancelled"
                          }
                          onClick={() =>
                            updateAppointmentStatus(appointment.id, "cancelled")
                          }
                          className="h-7 px-1 text-[10px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <CircleSlash className="h-3 w-3" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </details>
                ))
              )}
            </div>
          </SidebarSection>

          {/* Divider */}
          <div className="hidden" />

          <SidebarSection title="Notas" icon={StickyNote} count={notes.length}>
            <div>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {notes.length === 0 ? (
                  <p className="px-1 text-xs text-slate-600">Sin notas</p>
                ) : (
                  notes.map((note, index) => (
                    <details
                      key={note.id}
                      open={index === 0}
                      className="group rounded-lg bg-slate-800 px-3 py-2"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                        <span className="line-clamp-1 text-xs text-slate-300">
                          {note.note_text}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-2">
                        <p className="whitespace-pre-wrap text-xs text-slate-300">
                          {note.note_text}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-600">
                          {format(
                            new Date(note.created_at),
                            "MMM d, yyyy HH:mm",
                          )}
                        </p>
                      </div>
                    </details>
                  ))
                )}
              </div>
            </div>
          </SidebarSection>
        </div>
      </ScrollArea>
    </div>
  );
}
