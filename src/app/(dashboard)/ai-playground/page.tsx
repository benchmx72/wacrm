"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CalendarPlus,
  CircleDollarSign,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface LeadProfile {
  name: string;
  service: string;
  need: string;
  urgency: string;
  budget: string;
  stage: string;
  nextAction: string;
  businessContext: string;
}

const emptyLeadProfile: LeadProfile = {
  name: "",
  service: "Servicio profesional",
  need: "",
  urgency: "",
  budget: "",
  stage: "Nuevo lead",
  nextAction: "",
  businessContext:
    "Demo de servicio profesional: responder en tono consultivo, calificar necesidad y sugerir siguiente paso con humano cuando haya interes real.",
};

const demoProfiles = [
  {
    id: "general",
    label: "General",
    description: "Servicios profesionales",
    icon: Sparkles,
    starterMessages: [
      "Hola, vi su servicio y quiero saber si me pueden ayudar.",
      "Estoy comparando opciones y quiero entender como trabajan.",
      "Necesito resolver esto pronto, pero primero quiero saber costos aproximados.",
    ],
    profile: {
      name: "Cliente demo",
      service: "Servicio profesional",
      need: "Busca entender si el servicio resuelve su problema.",
      urgency: "Media: quiere avanzar si encuentra buena opcion.",
      budget: "No definido; pregunta por costos.",
      stage: "Nuevo lead",
      nextAction: "Entender necesidad, urgencia y criterio de decision.",
      businessContext:
        "Empresa de servicios profesionales. El objetivo es calificar el lead, detectar urgencia y agendar seguimiento humano cuando exista oportunidad real.",
    },
  },
  {
    id: "medical",
    label: "Clinica medica",
    description: "Pacientes y agenda",
    icon: Stethoscope,
    starterMessages: [
      "Hola, necesito una consulta esta semana. Me pueden ayudar?",
      "Quiero saber si atienden mi caso y cuanto cuesta la consulta.",
      "Tengo molestias desde hace dias y busco disponibilidad pronto.",
    ],
    profile: {
      name: "Paciente demo",
      service: "Clinica medica",
      need: "Quiere agendar una consulta y saber disponibilidad.",
      urgency: "Alta: busca atencion esta semana.",
      budget: "No definido; pregunta por costos.",
      stage: "Primer contacto",
      nextAction: "Confirmar especialidad, sintomas generales y horario preferido.",
      businessContext:
        "Clinica privada con agenda por especialidad. El agente no diagnostica ni recomienda tratamientos; solo orienta intake, disponibilidad y escalamiento a recepcion o personal medico.",
    },
  },
  {
    id: "legal",
    label: "Despacho legal",
    description: "Intake juridico",
    icon: BriefcaseBusiness,
    starterMessages: [
      "Hola, necesito hablar con un abogado por un problema urgente.",
      "Quiero saber si llevan casos laborales y cuanto cuesta la consulta.",
      "Tengo una fecha limite y no se que documentos necesito.",
    ],
    profile: {
      name: "Cliente legal demo",
      service: "Despacho de abogados",
      need: "Necesita orientacion inicial sobre un problema legal.",
      urgency: "Media: quiere hablar con alguien pronto.",
      budget: "No definido; pregunta por consulta inicial.",
      stage: "Calificacion",
      nextAction: "Identificar area legal, ciudad y plazo del problema.",
      businessContext:
        "Despacho legal de servicios profesionales. El agente no da asesoria juridica ni garantiza resultados; solo recopila datos basicos, identifica urgencia y deriva a un abogado.",
    },
  },
] satisfies Array<{
  id: string;
  label: string;
  description: string;
  icon: typeof Bot;
  starterMessages: string[];
  profile: LeadProfile;
}>;

export default function AiPlaygroundPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hola, soy Rod en modo laboratorio. Escribe como si fueras un cliente y probamos tono, memoria y calificacion.",
    },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedDemoId, setSelectedDemoId] = useState(demoProfiles[0].id);
  const [leadProfile, setLeadProfile] = useState<LeadProfile>(emptyLeadProfile);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [proposingAppointment, setProposingAppointment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/api/ai/agent/respond")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (data.error) throw new Error(data.error);

        if (data.session?.id && Array.isArray(data.messages) && data.messages.length > 0) {
          setSessionId(data.session.id);
          if (data.session.metadata?.lead_profile) {
            setLeadProfile({ ...emptyLeadProfile, ...data.session.metadata.lead_profile });
          }
          setMessages(
            data.messages.map((message: ChatMessage) => ({
              id: message.id,
              role: message.role,
              content: message.content,
            })),
          );
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "No se pudo cargar la memoria";
        setError(message);
      })
      .finally(() => {
        if (mounted) setLoadingHistory(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/agent/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          lead_profile: leadProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo generar respuesta");

      setSessionId(data.session?.id ?? sessionId);
      setMessages((current) => [
        ...current,
        {
          id: data.message?.id ?? crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `No pude responder todavia: ${message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setSessionId(null);
    setError(null);
    setDraft("");
    setLeadProfile(emptyLeadProfile);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Nueva sesion lista. Probemos otra conversacion como si entrara un cliente distinto.",
      },
    ]);
  };

  const updateLeadProfile = <K extends keyof LeadProfile>(
    key: K,
    value: LeadProfile[K],
  ) => {
    setLeadProfile((current) => ({ ...current, [key]: value }));
  };

  const applyDemoProfile = (demo: (typeof demoProfiles)[number]) => {
    setSelectedDemoId(demo.id);
    setLeadProfile(demo.profile);
    setDraft(
      `Hola, soy ${demo.profile.name}. ${demo.profile.need} Me puedes ayudar?`.trim(),
    );
  };

  const applyStarterMessage = (message: string) => {
    setDraft(message);
  };

  const createLeadInCrm = async () => {
    if (creatingLead) return;
    setCreatingLead(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/lead-to-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_profile: leadProfile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el lead");
      setLeadProfile((current) => ({
        ...current,
        stage: "Creado en CRM",
        nextAction: "Revisar el negocio en Pipelines y dar seguimiento humano.",
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
    } finally {
      setCreatingLead(false);
    }
  };

  const proposeAppointment = async () => {
    if (proposingAppointment) return;
    setProposingAppointment(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/appointments/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_profile: leadProfile,
          appointment_type:
            selectedDemoId === "legal"
              ? "Consulta legal"
              : selectedDemoId === "medical"
                ? "Consulta medica"
                : "Consulta de seguimiento",
          preferred_time: "Por confirmar",
          notes: leadProfile.nextAction || leadProfile.need,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo proponer cita");
      setLeadProfile((current) => ({
        ...current,
        nextAction:
          "Cita propuesta guardada como nota del contacto. Pendiente confirmar horario.",
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
    } finally {
      setProposingAppointment(false);
    }
  };

  const selectedDemo =
    demoProfiles.find((demo) => demo.id === selectedDemoId) ?? demoProfiles[0];

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Playground</h1>
          <p className="mt-1 text-sm text-slate-400">
            Simula WhatsApp, cambia industria y valida memoria del lead sin numero real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {demoProfiles.map((demo) => {
            const Icon = demo.icon;
            return (
              <Button
                key={demo.label}
                variant={selectedDemoId === demo.id ? "default" : "outline"}
                onClick={() => applyDemoProfile(demo)}
              >
                <Icon className="size-4" />
                {demo.label}
              </Button>
            );
          })}
          <Button variant="outline" onClick={reset}>
            Nueva sesion
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {demoProfiles.map((demo) => {
          const Icon = demo.icon;
          return (
            <button
              key={demo.id}
              type="button"
              onClick={() => applyDemoProfile(demo)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                selectedDemoId === demo.id
                  ? "border-primary bg-primary/10"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Icon className="size-4 text-primary" />
                {demo.label}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {demo.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid min-h-[620px] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="flex min-h-0 flex-col border-slate-800 bg-slate-900">
        <CardHeader className="border-b border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Bot className="size-5 text-primary" />
              Simulador WhatsApp: Rod SDR
            </CardTitle>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300">
              <MessageSquareText className="size-3.5 text-primary" />
              {selectedDemo.label}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-slate-800 bg-slate-950 text-slate-100",
                  )}
                >
                  {message.content}
                </div>
                {message.role === "user" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                    <UserRound className="size-4" />
                  </div>
                )}
              </div>
            ))}
            {loadingHistory && (
              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                  Cargando memoria...
                </div>
              </div>
            )}
            {sending && (
              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                  Pensando...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
              {error}
            </div>
          )}

          <div className="border-t border-slate-800 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {selectedDemo.starterMessages.map((message) => (
                <button
                  key={message}
                  type="button"
                  onClick={() => applyStarterMessage(message)}
                  className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-primary/60 hover:text-white"
                >
                  {message}
                </button>
              ))}
            </div>
          </div>

          <form ref={formRef} onSubmit={send} className="border-t border-slate-800 p-4">
            <div className="flex gap-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Escribe una pregunta, objecion o necesidad del cliente..."
                className="max-h-32 min-h-12 flex-1 border-slate-700 bg-slate-950 text-white"
              />
              <Button type="submit" disabled={sending || !draft.trim()} className="h-12">
                <Send className="size-4" />
                Enviar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CircleDollarSign className="size-4 text-primary" />
            Memoria del lead demo
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Este contexto viaja con cada mensaje del simulador y se guarda en la sesion.
          </p>
        </div>
        <Button
          type="button"
          onClick={createLeadInCrm}
          disabled={creatingLead}
          className="mt-4 w-full"
        >
          <Plus className="size-4" />
          {creatingLead ? "Creando lead..." : "Crear contacto y negocio"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={proposeAppointment}
          disabled={proposingAppointment}
          className="mt-2 w-full border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
        >
          <CalendarPlus className="size-4" />
          {proposingAppointment ? "Guardando cita..." : "Proponer cita"}
        </Button>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-name">Nombre</Label>
            <Input
              id="lead-name"
              value={leadProfile.name}
              onChange={(event) => updateLeadProfile("name", event.target.value)}
              className="border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-service">Vertical</Label>
            <Input
              id="lead-service"
              value={leadProfile.service}
              onChange={(event) => updateLeadProfile("service", event.target.value)}
              className="border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-need">Necesidad</Label>
            <Textarea
              id="lead-need"
              value={leadProfile.need}
              onChange={(event) => updateLeadProfile("need", event.target.value)}
              className="min-h-20 border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="lead-urgency">Urgencia</Label>
              <Input
                id="lead-urgency"
                value={leadProfile.urgency}
                onChange={(event) => updateLeadProfile("urgency", event.target.value)}
                className="border-slate-700 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-budget">Presupuesto</Label>
              <Input
                id="lead-budget"
                value={leadProfile.budget}
                onChange={(event) => updateLeadProfile("budget", event.target.value)}
                className="border-slate-700 bg-slate-950 text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-stage">Etapa</Label>
            <Input
              id="lead-stage"
              value={leadProfile.stage}
              onChange={(event) => updateLeadProfile("stage", event.target.value)}
              className="border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-next-action">Proxima accion</Label>
            <Textarea
              id="lead-next-action"
              value={leadProfile.nextAction}
              onChange={(event) => updateLeadProfile("nextAction", event.target.value)}
              className="min-h-20 border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-context">Contexto del negocio</Label>
            <Textarea
              id="lead-context"
              value={leadProfile.businessContext}
              onChange={(event) => updateLeadProfile("businessContext", event.target.value)}
              className="min-h-28 border-slate-700 bg-slate-950 text-white"
            />
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
