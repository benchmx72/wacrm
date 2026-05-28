"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/types";
import { useAuth } from "@/hooks/use-auth";
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

type AppointmentWithJoins = Appointment & {
  contact?: { name?: string | null; phone?: string | null } | null;
  deal?: { title?: string | null } | null;
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

const statusLabels: Record<Appointment["status"], string> = {
  proposed: "Propuestas",
  confirmed: "Confirmadas",
  cancelled: "Canceladas",
  completed: "Completadas",
};

const singleStatusLabels: Record<Appointment["status"], string> = {
  proposed: "Propuesta",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
};

const statusTone: Record<Appointment["status"], string> = {
  proposed: "bg-amber-500/15 text-amber-300",
  confirmed: "bg-primary/15 text-primary",
  cancelled: "bg-red-500/15 text-red-300",
  completed: "bg-slate-700 text-slate-300",
};

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
    timezone: appointment.timezone ?? "",
    location: appointment.location ?? "",
    notes: appointment.notes ?? "",
  };
}

export default function AppointmentsPage() {
  const supabase = createClient();
  const { profile } = useAuth();
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

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("appointments")
      .select("*, contact:contacts(name, phone), deal:deals(title)")
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
    }
    setUpdatingId(null);
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
      setEditingAppointment(null);
      setEditForm(null);
    }
    setSavingEdit(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Citas</h1>
        <p className="mt-1 text-sm text-slate-400">
          Revisa citas propuestas, confirma seguimientos y ajusta horarios cuando
          el cliente o el staff lo necesiten.
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
          Todas
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
            Cargando citas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <CalendarDays className="size-10 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">
              No hay citas en esta vista.
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
                      "Contacto sin nombre"}
                    {appointment.deal?.title ? ` - ${appointment.deal.title}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Horario preferido: {appointment.preferred_time ?? "Por confirmar"}
                  </p>
                  {appointment.scheduled_start && (
                    <p className="mt-1 text-xs text-slate-500">
                      Agendada:{" "}
                      {new Date(appointment.scheduled_start).toLocaleString("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                  {appointment.location && (
                    <p className="mt-1 text-xs text-slate-500">
                      Lugar/modalidad: {appointment.location}
                    </p>
                  )}
                  {appointment.notes && (
                    <p className="mt-2 max-w-3xl text-sm text-slate-300">
                      {appointment.notes}
                    </p>
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
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "confirmed"}
                      onClick={() => updateStatus(appointment.id, "confirmed")}
                      className="border-slate-700"
                    >
                      <CheckCircle2 className="size-4" />
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "completed"}
                      onClick={() => updateStatus(appointment.id, "completed")}
                      className="border-slate-700"
                    >
                      <ClipboardCheck className="size-4" />
                      Completar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === appointment.id || appointment.status === "cancelled"}
                      onClick={() => updateStatus(appointment.id, "cancelled")}
                      className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    >
                      <CircleSlash className="size-4" />
                      Cancelar
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
            <DialogTitle>Editar cita</DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-title">Titulo</Label>
                <Input
                  id="appointment-title"
                  value={editForm.title}
                  onChange={(event) => updateEditForm("title", event.target.value)}
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-type">Tipo</Label>
                <Input
                  id="appointment-type"
                  value={editForm.appointment_type}
                  onChange={(event) =>
                    updateEditForm("appointment_type", event.target.value)
                  }
                  placeholder="Consulta, seguimiento, evaluacion..."
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-status">Estado</Label>
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
                  <option value="proposed">Propuesta</option>
                  <option value="confirmed">Confirmada</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="preferred-time">Horario preferido</Label>
                <Input
                  id="preferred-time"
                  value={editForm.preferred_time}
                  onChange={(event) =>
                    updateEditForm("preferred_time", event.target.value)
                  }
                  placeholder="Ej. Esta semana por la tarde"
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled-start">Inicio agendado</Label>
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
                <Label htmlFor="scheduled-end">Fin agendado</Label>
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
                <Label htmlFor="timezone">Zona horaria</Label>
                <Input
                  id="timezone"
                  value={editForm.timezone}
                  onChange={(event) => updateEditForm("timezone", event.target.value)}
                  placeholder="America/Mexico_City"
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Lugar o modalidad</Label>
                <Input
                  id="location"
                  value={editForm.location}
                  onChange={(event) => updateEditForm("location", event.target.value)}
                  placeholder="Zoom, consultorio, llamada..."
                  className="border-slate-700 bg-slate-900"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-notes">Notas internas</Label>
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
              Cerrar
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editForm?.title.trim()}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
