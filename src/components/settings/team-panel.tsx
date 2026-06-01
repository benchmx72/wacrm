"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MailPlus, Power, RefreshCw, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { normalizeRole, type AppRole } from "@/lib/auth/roles";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
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

const roleOptions: AppRole[] = ["client_admin", "staff", "viewer"];

export function TeamPanel() {
  const { user: currentUser, profile } = useAuth();
  const { locale, t } = useLanguage();
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

  function roleLabel(value: AppRole) {
    switch (value) {
      case "super_admin":
        return t("settings.team.roles.super_admin");
      case "client_admin":
        return t("settings.team.roles.client_admin");
      case "staff":
        return t("settings.team.roles.staff");
      case "viewer":
        return t("settings.team.roles.viewer");
    }
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/team/users");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((data.users ?? []) as TeamUser[]);
    } else {
      toast.error(data.error ?? t("settings.team.failedLoad"));
    }
    setLoading(false);
  }, [t]);

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
      toast.success(t("settings.team.invitationSent"));
    } else {
      toast.error(data.error ?? t("settings.team.failedInvite"));
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
      toast.success(t("settings.team.userUpdated"));
    } else {
      toast.error(data.error ?? t("settings.team.failedUpdate"));
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
        toast.success(t("settings.team.invitationLinkCopied"));
      } else {
        toast.success(data.message ?? t("settings.team.invitationResent"));
      }
    } else {
      toast.error(data.error ?? t("settings.team.failedResend"));
    }
    setResendingUserId(null);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <MailPlus className="size-4 text-primary" />
            {t("settings.team.inviteTitle")}
          </CardTitle>
          <CardDescription>
            {t("settings.team.inviteDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={inviteUser}>
            <div className="space-y-2">
              <Label htmlFor="team-email">{t("settings.team.email")}</Label>
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
              <Label htmlFor="team-name">{t("settings.team.name")}</Label>
              <Input
                id="team-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={t("settings.team.namePlaceholder")}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-role">{t("settings.team.role")}</Label>
              <select
                id="team-role"
                value={role}
                onChange={(event) => setRole(event.target.value as AppRole)}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-sm text-white outline-none focus-visible:border-primary"
              >
                {allowedRoles.map((option) => (
                  <option key={option} value={option}>
                    {roleLabel(option)}
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
              {sending ? t("settings.team.sending") : t("settings.team.sendInvitation")}
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
                {t("settings.team.teamTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings.team.teamDescription")}
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
              {t("settings.team.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {t("settings.team.loading")}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <Shield className="size-10 text-slate-600" />
              <p className="mt-3 text-sm text-slate-400">
                {t("settings.team.empty")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="px-4 text-slate-400">{t("settings.team.user")}</TableHead>
                  <TableHead className="text-slate-400">{t("settings.team.role")}</TableHead>
                  <TableHead className="text-slate-400">{t("settings.team.status")}</TableHead>
                  <TableHead className="text-slate-400">{t("settings.team.actions")}</TableHead>
                  <TableHead className="text-slate-400">{t("settings.team.created")}</TableHead>
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
                            {user.full_name || t("settings.team.unnamed")}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[160px] text-slate-300">
                        {userRole === "super_admin" ? (
                          roleLabel("super_admin")
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
                              <option key={option} value={option}>
                                {roleLabel(option)}
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
                            ? t("settings.team.invited")
                            : userStatus === "disabled"
                              ? t("settings.team.disabled")
                              : t("common.active")}
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
                              {rowResending ? t("settings.team.resending") : t("settings.team.resend")}
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
                              ? t("common.saving")
                              : userStatus === "disabled"
                                ? t("settings.team.reactivate")
                                : t("common.deactivate")}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {new Date(user.created_at).toLocaleDateString(locale)}
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
