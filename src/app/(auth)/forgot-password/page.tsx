"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SophiaLogo } from "@/components/brand/sophia-logo";
import { CheckCircle, ArrowLeft } from "lucide-react";

function resetErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento y vuelve a probar.";
  }
  return message;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(resetErrorMessage(error.message));
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl text-white">
              Revisa tu correo
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enviamos un enlace para restablecer la contrasena a{" "}
              <span className="text-white">{email}</span>. Revisa tu bandeja
              de entrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button
                variant="outline"
                className="w-full border-border text-slate-300 hover:bg-secondary hover:text-white"
              >
                Volver al inicio de sesion
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-40 items-center justify-center">
            <SophiaLogo className="h-10 w-[154px]" />
          </div>
          <CardTitle className="text-xl text-white">
            Restablecer contrasena
          </CardTitle>
          <CardDescription className="text-slate-400">
            Escribe tu correo y te enviaremos un enlace de recuperacion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-slate-300">
                Correo
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-secondary text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar enlace"}
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio de sesion
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
