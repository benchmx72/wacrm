"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MailPlus, Power, RefreshCw, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { normalizeRole, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type TeamUser = Pick<
  Profile,
  | "id"
  | "user_id"
  | "account_owner_id"
  | "full_name"
  | "email"
  | "avatar_url"
  | "role"
  | "status"
  | "created_at"
>;

const roleOptions: Array<{ value: AppRole; label: string }> = [
  { value: "client_admin", label: ROLE_LABELS.client_admin },
  { value: "staff", label: ROLE_LABELS.staff },
  { value: "viewer", label: ROLE_LABELS.viewer },
];

export function TeamPanel() {
  const { user: currentUser, profile } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("staff");

  const allowedRoles = useMemo(() => {
    const currentRole = normalizeRole(profile?.role);
    if (currentRole === "super_admin" || currentRole === "client_admin") {
      return roleOptions;
    }
    return [];
  }, [profile?.role]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/team/users");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((data.users ?? []) as TeamUser[]);
    } else {
      toast.error(data.error ?? "No se pudo cargar el equipo");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const res = await fetch("/api/team/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.user) {
      setUsers((current) => [data.user as TeamUser, ...current]);
      setEmail("");
      setFullName("");
      setRole("staff");
      toast.success("Invitacion enviada");
    } else {
      toast.error(data.error ?? "No se pudo enviar la invitacion");
    }
    setSending(false);
  }

  async function updateUser(
    targetUserId: string,
    payload: { role?: AppRole; status?: "active" | "disabled" },
  ) {
    if (updatingUserId) return;
    setUpdatingUserId(targetUserId);
    const res = await fetch("/api/team/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: targetUserId,
        ...payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.user) {
      setUsers((current) =>
        current.map((teamUser) =>
          teamUser.user_id === targetUserId ? (data.user as TeamUser) : teamUser,
        ),
      );
      toast.success("Usuario actualizado");
    } else {
      toast.error(data.error ?? "No se pudo actualizar el usuario");
    }
    setUpdatingUserId(null);
  }

  async function resendInvitation(targetUserId: string) {
    if (resendingUserId) return;
    setResendingUserId(targetUserId);
    const res = await fetch("/api/team/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resend_invitation",
        user_id: targetUserId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (typeof data.invitation_link === "string") {
        await navigator.clipboard?.writeText(data.invitation_link).catch(() => {});
        toast.success("Link de invitacion copiado");
      } else {
        toast.success(data.message ?? "Invitacion reenviada");
      }
    } else {
      toast.error(data.error ?? "No se pudo reenviar la invitacion");
    }
    setResendingUserId(null);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <MailPlus className="size-4 text-primary" />
            Invitar usuario
          </CardTitle>
          <CardDescription>
            El usuario recibira un correo para entrar y definir su acceso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={inviteUser}>
            <div className="space-y-2">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="usuario@cliente.com"
                className="border-slate-700 bg-slate-950"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nombre del usuario"
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-role">Rol</Label>
              <select
                id="team-role"
                value={role}
                onChange={(event) => setRole(event.target.value as AppRole)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-sm text-white outline-none focus-visible:border-primary"
              >
                {allowedRoles.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={sending || allowedRoles.length === 0}
              className="w-full"
            >
              <MailPlus className="size-4" />
              {sending ? "Enviando..." : "Enviar invitacion"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="border-b border-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="size-4 text-primary" />
                Equipo
              </CardTitle>
              <CardDescription>
                Usuarios con acceso al CRM y su rol operativo.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadUsers}
              disabled={loading}
              className="border-slate-700"
            >
              <RefreshCw className="size-4" />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Cargando equipo...
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <Shield className="size-10 text-slate-600" />
              <p className="mt-3 text-sm text-slate-400">
                Aun no hay usuarios en este equipo.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="px-4 text-slate-400">Usuario</TableHead>
                  <TableHead className="text-slate-400">Rol</TableHead>
                  <TableHead className="text-slate-400">Estado</TableHead>
                  <TableHead className="text-slate-400">Acciones</TableHead>
                  <TableHead className="text-slate-400">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isSelf = user.user_id === currentUser?.id;
                  const rowUpdating = updatingUserId === user.user_id;
                  const rowResending = resendingUserId === user.user_id;
                  const userRole = normalizeRole(user.role);
                  const userStatus = user.status ?? "active";
                  const locked =
                    isSelf || userRole === "super_admin" || rowUpdating || rowResending;

                  return (
                    <TableRow
                      key={user.id}
                      className="border-slate-800 hover:bg-slate-800/40"
                    >
                      <TableCell className="px-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">
                            {user.full_name || "Sin nombre"}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[160px] text-slate-300">
                        {userRole === "super_admin" ? (
                          ROLE_LABELS.super_admin
                        ) : (
                          <select
                            value={userRole}
                            disabled={locked}
                            onChange={(event) =>
                              updateUser(user.user_id, {
                                role: event.target.value as AppRole,
                              })
                            }
                            className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {allowedRoles.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={userStatus === "disabled" ? "destructive" : "outline"}
                          className="border-slate-700 text-slate-200"
                        >
                          {userStatus === "invited"
                            ? "Invitado"
                            : userStatus === "disabled"
                              ? "Desactivado"
                              : "Activo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {userStatus === "invited" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={locked}
                              onClick={() => resendInvitation(user.user_id)}
                              className="border-slate-700"
                            >
                              <MailPlus className="size-4" />
                              {rowResending ? "Reenviando..." : "Reenviar"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={locked}
                            onClick={() =>
                              updateUser(user.user_id, {
                                status:
                                  userStatus === "disabled" ? "active" : "disabled",
                              })
                            }
                            className="border-slate-700"
                          >
                            <Power className="size-4" />
                            {rowUpdating
                              ? "Guardando..."
                              : userStatus === "disabled"
                                ? "Reactivar"
                                : "Desactivar"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {new Date(user.created_at).toLocaleDateString("es-MX")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
