"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, KeyRound, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface AgentSettings {
  id: string;
  name: string;
  model: string;
  temperature: number;
  is_active: boolean;
  system_prompt: string;
  knowledge_mode: "off" | "suggestions" | "approved_only";
  openai_vector_store_id: string | null;
}

interface PromptPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

const MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-5-mini", "gpt-5"] as const;

export function AiAgentPanel() {
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>([]);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/ai/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (data.error) throw new Error(data.error);
        setAgent(data.agent);
        setDefaultPrompt(String(data.defaultPrompt ?? ""));
        setPromptPresets(Array.isArray(data.promptPresets) ? data.promptPresets : []);
        setOpenaiConfigured(Boolean(data.openaiConfigured));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load AI settings"))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
    setAgent((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save AI settings");
      setAgent(data.agent);
      setDefaultPrompt(String(data.defaultPrompt ?? defaultPrompt));
      setPromptPresets(Array.isArray(data.promptPresets) ? data.promptPresets : promptPresets);
      setOpenaiConfigured(Boolean(data.openaiConfigured));
      toast.success("Configuracion del agente guardada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaultPrompt = () => {
    if (!defaultPrompt) {
      toast.error("No se pudo cargar el prompt SDR desde skills");
      return;
    }

    update("system_prompt", defaultPrompt);
    toast.success("Prompt SDR cargado desde skills");
  };

  const applyPromptPreset = (preset: PromptPreset) => {
    update("system_prompt", preset.prompt);
    toast.success(`Preset cargado: ${preset.label}`);
  };

  if (loading || !agent) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">Agente IA</CardTitle>
          <CardDescription>Cargando configuracion...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Bot className="size-5 text-primary" />
              Agente IA
            </CardTitle>
            <CardDescription>
              Configura el agente directo con OpenAI para pruebas internas antes de conectar canales.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-xs text-slate-300">
            <KeyRound className={openaiConfigured ? "size-4 text-emerald-400" : "size-4 text-amber-300"} />
            {openaiConfigured ? "OPENAI_API_KEY activa" : "Falta OPENAI_API_KEY"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-name">Nombre</Label>
            <Input
              id="ai-name"
              value={agent.name}
              onChange={(event) => update("name", event.target.value)}
              className="border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select value={agent.model} onValueChange={(value) => update("model", value ?? agent.model)}>
              <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                {MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
            <span>
              <span className="block text-sm font-medium text-white">IA activa</span>
              <span className="text-xs text-slate-400">Permite respuestas del agente.</span>
            </span>
            <Switch checked={agent.is_active} onCheckedChange={(checked) => update("is_active", checked)} />
          </label>

          <div className="space-y-2">
            <Label htmlFor="temperature">Temperatura</Label>
            <Input
              id="temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={agent.temperature}
              onChange={(event) => update("temperature", Number(event.target.value))}
              className="border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label>Conocimiento</Label>
            <Select
              value={agent.knowledge_mode}
              onValueChange={(value) => update("knowledge_mode", value as AgentSettings["knowledge_mode"])}
            >
              <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                <SelectItem value="suggestions">Sugerencias con revision</SelectItem>
                <SelectItem value="approved_only">Solo aprobado</SelectItem>
                <SelectItem value="off">Apagado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vector-store">OpenAI vector store ID</Label>
          <Input
            id="vector-store"
            value={agent.openai_vector_store_id ?? ""}
            onChange={(event) => update("openai_vector_store_id", event.target.value)}
            placeholder="vs_..."
            className="border-slate-700 bg-slate-950 text-white"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="system-prompt">Prompt base</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restoreDefaultPrompt}
              disabled={!defaultPrompt}
              className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
            >
              <RotateCcw className="size-4" />
              Restaurar SDR desde skills
            </Button>
          </div>
          {promptPresets.length > 0 && (
            <div className="grid gap-2 md:grid-cols-3">
              {promptPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPromptPreset(preset)}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-left transition-colors hover:border-primary/60 hover:bg-slate-900"
                >
                  <span className="block text-sm font-semibold text-white">
                    {preset.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Textarea
            id="system-prompt"
            value={agent.system_prompt}
            onChange={(event) => update("system_prompt", event.target.value)}
            className="min-h-80 border-slate-700 bg-slate-950 font-mono text-sm text-white"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Guardando..." : "Guardar agente"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
