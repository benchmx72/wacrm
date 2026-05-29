"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Tu correo aun no esta confirmado. Revisa tu invitacion o tu bandeja de entrada.";
  }
  return message;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card shadow-2xl shadow-black/20">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-40 items-center justify-center">
            <SophiaLogo className="h-10 w-[154px]" />
          </div>
          <CardTitle className="text-xl text-white">Iniciar sesion</CardTitle>
          <CardDescription className="text-slate-400">
            Accede al CRM con el correo de tu invitacion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
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

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-slate-300">
                  Contrasena
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-[#0ABFAD] hover:text-[#7F77DD]"
                >
                  Olvidaste tu contrasena?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Escribe tu contrasena"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-secondary text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            El acceso se crea por invitacion del administrador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
