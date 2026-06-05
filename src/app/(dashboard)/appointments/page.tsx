"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  History,
  Mail,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { hasPermission } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AppointmentWithJoins = Appointment & {
  contact?: { name?: string | null; phone?: string | null } | null;
  deal?: { title?: string | null } | null;
  change_requests?: AppointmentChangeRequest[];
  notifications?: AppointmentNotification[];
};

type AppointmentChangeRequest = {
  id: string;
  request_type: "cancel" | "reschedule";
  status: "pending" | "approved" | "rejected";
  requested_text: string;
  requested_time?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type AppointmentNotification = {
  id: string;
  status: "pending" | "sending" | "skipped" | "sent" | "failed";
  recipient_type: "client" | "staff";
  recipient_email?: string | null;
  subject?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type AppointmentActivity = {
  id: string;
  date: string;
  title: string;
  description: string;
  icon: "request" | "notification" | "warning";
  tone: string;
};

type EditForm = {
  title: string;
  appointment_type: string;
  status: Appointment["status"];
  preferred_time: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  location: string;
  notes: string;
};

const statusTone: Record<Appointment["status"], string> = {
  proposed: "bg-amber-500/15 text-amber-300",
  confirmed: "bg-primary/15 text-primary",
  cancelled: "bg-red-500/15 text-red-300",
  completed: "bg-slate-700 text-slate-300",
};

const DEFAULT_APPOINTMENT_TIMEZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "America/Santarem";

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formFromAppointment(appointment: Appointment): EditForm {
  return {
    title: appointment.title ?? "",
    appointment_type: appointment.appointment_type ?? "",
    status: appointment.status,
    preferred_time: appointment.preferred_time ?? "",
    scheduled_start: toDateTimeLocal(appointment.scheduled_start),
    scheduled_end: toDateTimeLocal(appointment.scheduled_end),
    timezone: appointment.timezone ?? DEFAULT_APPOINTMENT_TIMEZONE,
    location: appointment.location ?? "",
    notes: appointment.notes ?? "",
  };
}

export default function AppointmentsPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const { locale, t } = useLanguage();
  const canManageAppointments = hasPermission(
    profile?.role,
    "manage_appointments",
  );
  const [appointments, setAppointments] = useState<AppointmentWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Appointment["status"] | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] =
    useState<AppointmentWithJoins | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
    null,
  );

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("appointments")
      .select(
        "*, contact:contacts(name, phone), deal:deals(title), change_requests:appointment_change_requests(id, request_type, status, requested_text, requested_time, resolved_at, created_at, updated_at), notifications:appointment_notifications(id, status, recipient_type, recipient_email, subject, error_message, created_at, updated_at)",
      )
      .order("created_at", { ascending: false });
    setAppointments((data ?? []) as AppointmentWithJoins[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppointments();
  }, [fetchAppointments]);

  const counts = useMemo(() => {
    return appointments.reduce(
      (acc, appointment) => {
        acc[appointment.status] += 1;
        return acc;
      },
      { proposed: 0, confirmed: 0, cancelled: 0, completed: 0 },
    );
  }, [appointments]);

  const filtered =
    filter === "all"
      ? appointments
      : appointments.filter((appointment) => appointment.status === filter);

  const statusLabels: Record<Appointment["status"], string> = {
    proposed: t("appointments.statuses.proposedPlural"),
    confirmed: t("appointments.statuses.confirmedPlural"),
    cancelled: t("appointments.statuses.cancelledPlural"),
    completed: t("appointments.statuses.completedPlural"),
  };

  const singleStatusLabels: Record<Appointment["status"], string> = {
    proposed: t("appointments.statuses.proposed"),
    confirmed: t("appointments.statuses.confirmed"),
    cancelled: t("appointments.statuses.cancelled"),
    completed: t("appointments.statuses.completed"),
  };

  const requestStatusLabels: Record<AppointmentChangeRequest["status"], string> = {
    pending: t("appointments.activity.requestPending"),
    approved: t("appointments.activity.requestApproved"),
    rejected: t("appointments.activity.requestRejected"),
  };

  const notificationStatusLabels: Record<AppointmentNotification["status"], string> = {
    pending: t("appointments.activity.notificationPending"),
    sending: t("appointments.activity.notificationSending"),
    skipped: t("appointments.activity.notificationSkipped"),
    sent: t("appointments.activity.notificationSent"),
    failed: t("appointments.activity.notificationFailed"),
  };

  const recipientLabels: Record<AppointmentNotification["recipient_type"], string> = {
    client: t("appointments.activity.client"),
    staff: t("appointments.activity.staff"),
  };

  function buildActivity(appointment: AppointmentWithJoins): AppointmentActivity[] {
    const requests = (appointment.change_requests ?? []).map((request) => ({
      id: `request-${request.id}`,
      date: request.resolved_at ?? request.updated_at ?? request.created_at,
      title:
        request.request_type === "cancel"
          ? t("appointments.activity.cancelRequest")
          : t("appointments.activity.rescheduleRequest"),
      description: `${requestStatusLabels[request.status]}: ${
        request.requested_time || request.requested_text
      }`,
      icon: "request" as const,
      tone:
        request.status === "pending"
          ? "text-amber-300"
          : request.status === "approved"
            ? "text-emerald-300"
            : "text-red-300",
    }));

    const notifications = (appointment.notifications ?? []).map((notification) => ({
      id: `notification-${notification.id}`,
      date: notification.updated_at ?? notification.created_at,
      title: `${t("appointments.activity.notification")}: ${
        notificationStatusLabels[notification.status]
      }`,
      description: [
        recipientLabels[notification.recipient_type],
        notification.recipient_email,
        notification.error_message,
      ]
        .filter(Boolean)
        .join(" - "),
      icon: notification.status === "failed" ? ("warning" as const) : ("notification" as const),
      tone: notification.status === "failed" ? "text-red-300" : "text-sky-300",
    }));

    return [...requests, ...notifications]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }

  async function updateStatus(id: string, status: Appointment["status"]) {
    if (!canManageAppointments) return;
    if (updatingId) return;
    setUpdatingId(id);
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.appointment) {
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === id
            ? { ...appointment, ...data.appointment }
            : appointment,
        ),
      );
      await fetchAppointments();
    }
    setUpdatingId(null);
  }

  async function resolveChangeRequest(
    requestId: string,
    action: "approve" | "reject",
  ) {
    if (!canManageAppointments || resolvingRequestId) return;
    setResolvingRequestId(requestId);

    const res = await fetch(`/api/appointments/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      await fetchAppointments();
      toast.success(
        action === "approve"
          ? t("appointments.changeRequests.approved")
          : t("appointments.changeRequests.rejected"),
      );
    } else {
      toast.error(data.error || t("appointments.changeRequests.failed"));
    }

    setResolvingRequestId(null);
  }

  function openEditor(appointment: AppointmentWithJoins) {
    if (!canManageAppointments) return;
    setEditingAppointment(appointment);
    setEditForm(formFromAppointment(appointment));
  }

  function updateEditForm<K extends keyof EditForm>(field: K, value: EditForm[K]) {
    setEditForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveEdit() {
    if (!canManageAppointments) return;
    if (!editingAppointment || !editForm || savingEdit) return;
    setSavingEdit(true);
    const res = await fetch(`/api/appointments/${editingAppointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        scheduled_start: fromDateTimeLocal(editForm.scheduled_start),
        scheduled_end: fromDateTimeLocal(editForm.scheduled_end),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.appointment) {
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === editingAppointment.id
            ? { ...appointment, ...data.appointment }
            : appointment,
        ),
      );
      await fetchAppointments();
      setEditingAppointment(null);
      setEditForm(null);
    }
    setSavingEdit(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t("appointments.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t("appointments.description")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["proposed", "confirmed", "completed", "cancelled"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              filter === status
                ? "border-primary bg-primary/10"
                : "border-slate-800 bg-slate-900 hover:border-slate-700",
            )}
          >
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {statusLabels[status]}
            </span>
            <span className="mt-2 block text-2xl font-bold text-white">
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          {t("appointments.filters.all")}
        </Button>
        {(["proposed", "confirmed", "completed", "cancelled"] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            onClick={() => setFilter(status)}
          >
            {statusLabels[status]}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {t("appointments.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <CalendarDays className="size-10 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">
              {t("appointments.empty")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((appointment) => (
              <div
                key={appointment.id}
                className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-white">
                      {appointment.title}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        statusTone[appointment.status],
                      )}
                    >
                      {singleStatusLabels[appointment.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {appointment.contact?.name ??
                      appointment.contact?.phone ??
                      t("appointments.unnamedContact")}
                    {appointment.deal?.title ? ` - ${appointment.deal.title}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("appointments.preferredTime")}: {appointment.preferred_time ?? t("appointments.toConfirm")}
                  </p>
                  {appointment.scheduled_start && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("appointments.scheduled")}:{" "}
                      {new Date(appointment.scheduled_start).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: appointment.timezone || DEFAULT_APPOINTMENT_TIMEZONE,
                      })}
                    </p>
                  )}
                  {appointment.location && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("appointments.location")}: {appointment.location}
                    </p>
                  )}
                  {appointment.notes && (
                    <p className="mt-2 max-w-3xl text-sm text-slate-300">
                      {appointment.notes}
                    </p>
                  )}
                  {(appointment.change_requests ?? [])
                    .filter((request) => request.status === "pending")
                    .map((request) => (
                      <div
                        key={request.id}
                        className="mt-3 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                          {request.request_type === "cancel" ? (
                            <CircleSlash className="size-4" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                          {request.request_type === "cancel"
                            ? t("appointments.changeRequests.cancelTitle")
                            : t("appointments.changeRequests.rescheduleTitle")}
                        </div>
                        <p className="mt-1 text-sm text-slate-200">
                          {request.requested_text}
                        </p>
                        {canManageAppointments && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={resolvingRequestId === request.id}
                              onClick={() =>
                                resolveChangeRequest(
                                  request.id,
                                  "approve",
                                )
                              }
                            >
                              <CheckCircle2 className="size-4" />
                              {t("appointments.changeRequests.approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={resolvingRequestId === request.id}
                              onClick={() =>
                                resolveChangeRequest(
                                  request.id,
                                  "reject",
                                )
                              }
                              className="border-slate-700"
                            >
                              <X className="size-4" />
                              {t("appointments.changeRequests.reject")}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  {buildActivity(appointment).length > 0 && (
                    <details className="mt-3 max-w-3xl rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-slate-300 marker:hidden">
                        <span className="flex items-center gap-2">
                          <History className="size-4 text-primary" />
                          {t("appointments.activity.title")}
                        </span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {t("appointments.activity.latest")}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2">
                        {buildActivity(appointment).map((item) => {
                          const Icon =
                            item.icon === "request"
                              ? RotateCcw
                              : item.icon === "warning"
                                ? AlertCircle
                                : Mail;

                          return (
                            <div
                              key={item.id}
                              className="grid gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 p-2 text-xs sm:grid-cols-[1fr_auto]"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 font-semibold text-slate-200">
                                  <Icon className={cn("size-3.5 shrink-0", item.tone)} />
                                  <span className="truncate">{item.title}</span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-slate-400">
                                  {item.description}
                                </p>
                              </div>
                              <time className="text-[11px] text-slate-500">
                                {new Date(item.date).toLocaleString(locale, {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                  timeZone:
                                    appointment.timezone || DEFAULT_APPOINTMENT_TIMEZONE,
                                })}
                              </time>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
                {canManageAppointments && (
                  <div className="flex flex-wrap items-start gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(appointment)}
                      className="border-slate-700"
                    >
                      <Pencil className="size-4" />
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "confirmed"}
                      onClick={() => updateStatus(appointment.id, "confirmed")}
                      className="border-slate-700"
                    >
                      <CheckCircle2 className="size-4" />
                      {t("appointments.actions.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "completed"}
                      onClick={() => updateStatus(appointment.id, "completed")}
                      className="border-slate-700"
                    >
                      <ClipboardCheck className="size-4" />
                      {t("appointments.actions.complete")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "cancelled"}
                      onClick={() => updateStatus(appointment.id, "cancelled")}
                      className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    >
                      <CircleSlash className="size-4" />
                      {t("appointments.actions.cancel")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editingAppointment && editForm)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAppointment(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-950 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("appointments.editDialog.title")}</DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-title">{t("appointments.editDialog.appointmentTitle")}</Label>
                <Input
                  id="appointment-title"
                  value={editForm.title}
                  onChange={(event) => updateEditForm("title", event.target.value)}
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-type">{t("appointments.editDialog.type")}</Label>
                <Input
                  id="appointment-type"
                  value={editForm.appointment_type}
                  onChange={(event) =>
                    updateEditForm("appointment_type", event.target.value)
                  }
                  placeholder={t("appointments.editDialog.typePlaceholder")}
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-status">{t("appointments.editDialog.status")}</Label>
                <select
                  id="appointment-status"
                  value={editForm.status}
                  onChange={(event) =>
                    updateEditForm(
                      "status",
                      event.target.value as Appointment["status"],
                    )
                  }
                  className="h-8 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white outline-none focus-visible:border-primary"
                >
                  <option value="proposed">{singleStatusLabels.proposed}</option>
                  <option value="confirmed">{singleStatusLabels.confirmed}</option>
                  <option value="completed">{singleStatusLabels.completed}</option>
                  <option value="cancelled">{singleStatusLabels.cancelled}</option>
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="preferred-time">{t("appointments.preferredTime")}</Label>
                <Input
                  id="preferred-time"
                  value={editForm.preferred_time}
                  onChange={(event) =>
                    updateEditForm("preferred_time", event.target.value)
                  }
                  placeholder={t("appointments.editDialog.preferredTimePlaceholder")}
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled-start">{t("appointments.editDialog.scheduledStart")}</Label>
                <Input
                  id="scheduled-start"
                  type="datetime-local"
                  value={editForm.scheduled_start}
                  onChange={(event) =>
                    updateEditForm("scheduled_start", event.target.value)
                  }
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled-end">{t("appointments.editDialog.scheduledEnd")}</Label>
                <Input
                  id="scheduled-end"
                  type="datetime-local"
                  value={editForm.scheduled_end}
                  onChange={(event) =>
                    updateEditForm("scheduled_end", event.target.value)
                  }
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">{t("appointments.editDialog.timezone")}</Label>
                <Input
                  id="timezone"
                  value={editForm.timezone}
                  onChange={(event) => updateEditForm("timezone", event.target.value)}
                  placeholder="America/Santarem"
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">{t("appointments.location")}</Label>
                <Input
                  id="location"
                  value={editForm.location}
                  onChange={(event) => updateEditForm("location", event.target.value)}
                  placeholder={t("appointments.editDialog.locationPlaceholder")}
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-notes">{t("appointments.editDialog.notes")}</Label>
                <Textarea
                  id="appointment-notes"
                  value={editForm.notes}
                  onChange={(event) => updateEditForm("notes", event.target.value)}
                  className="min-h-24 border-slate-700 bg-slate-900"
                />
              </div>
            </div>
          )}

          <DialogFooter className="border-slate-800 bg-slate-900">
            <Button
              variant="outline"
              className="border-slate-700"
              onClick={() => {
                setEditingAppointment(null);
                setEditForm(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editForm?.title.trim()}>
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
