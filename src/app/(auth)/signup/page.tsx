"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, ShieldCheck } from "lucide-react";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-white">
            Acceso por invitacion
          </CardTitle>
          <CardDescription className="text-slate-400">
            Las cuentas del CRM solo pueden ser creadas por un administrador
            desde Configuracion &gt; Usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            Si ya recibiste una invitacion, abre el enlace del correo para
            activar tu acceso. Si necesitas entrar al sistema, solicita una
            invitacion al administrador de tu empresa.
          </div>

          <Link href="/login">
            <Button className="w-full">
              <MessageSquare className="size-4" />
              Ir a inicio de sesion
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
