'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, KeyRound, Loader2 } from 'lucide-react';

import { SophiaLogo } from '@/components/brand/sophia-logo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

const MIN_PASSWORD = 8;

function passwordErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('password')) {
    return `La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  if (normalized.includes('auth session missing')) {
    return 'El enlace expiro o ya fue usado. Solicita uno nuevo.';
  }
  return message;
}

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    if (password !== confirm) {
      setError('La contrasena y la confirmacion no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(passwordErrorMessage(updateError.message));
      setLoading(false);
      return;
    }

    await fetch('/api/auth/profile-activated', { method: 'POST' }).catch(() => null);
    setDone(true);
    setLoading(false);
    setTimeout(() => router.push('/dashboard'), 900);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card shadow-2xl shadow-black/20">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-40 items-center justify-center">
            <SophiaLogo className="h-10 w-[154px]" />
          </div>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            {done ? (
              <CheckCircle className="h-5 w-5 text-[#0ABFAD]" />
            ) : (
              <KeyRound className="h-5 w-5 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl text-white">
            {done ? 'Contrasena lista' : 'Crear contrasena'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {done
              ? 'Tu acceso quedo configurado. Te llevamos al CRM.'
              : 'Define tu contrasena para entrar a SophIA CRM.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {checkingSession ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando enlace...
            </div>
          ) : !hasSession ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                El enlace expiro o ya fue usado. Solicita un nuevo enlace de
                recuperacion o pide al administrador reenviar la invitacion.
              </div>
              <Link href="/forgot-password">
                <Button className="w-full">Solicitar nuevo enlace</Button>
              </Link>
            </div>
          ) : done ? (
            <Link href="/dashboard">
              <Button className="w-full">Ir al CRM</Button>
            </Link>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-slate-300">
                  Nueva contrasena
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  placeholder="Minimo 8 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="border-border bg-secondary text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm" className="text-slate-300">
                  Confirmar contrasena
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  placeholder="Repite tu contrasena"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  className="border-border bg-secondary text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar contrasena'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
