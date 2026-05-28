import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAuthAdmin } from "@/lib/auth/admin-client";
import {
  APP_ROLES,
  normalizeRole,
  hasPermission,
  type AppRole,
} from "@/lib/auth/roles";

const INVITABLE_BY_ROLE: Record<AppRole, AppRole[]> = {
  super_admin: ["client_admin", "staff", "viewer"],
  client_admin: ["client_admin", "staff", "viewer"],
  staff: [],
  viewer: [],
};

const PROFILE_SELECT =
  "id, user_id, account_owner_id, full_name, email, avatar_url, role, status, created_at";

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getOrigin(request: Request) {
  return (
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

async function getRequesterProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, account_owner_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requester = await getRequesterProfile(supabase, user.id);
  if (!hasPermission(requester?.role, "manage_users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = normalizeRole(requester?.role);
  const accountOwnerId = requester?.account_owner_id ?? user.id;
  const admin = supabaseAuthAdmin();
  let query = admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("created_at", { ascending: false });

  if (role !== "super_admin") {
    query = query.eq("account_owner_id", accountOwnerId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requester = await getRequesterProfile(supabase, user.id);
  if (!hasPermission(requester?.role, "manage_users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requesterRole = normalizeRole(requester?.role);
  const body = await request.json().catch(() => null);

  if (body?.action === "resend_invitation") {
    const targetUserId = cleanText(body?.user_id, 80);
    if (!targetUserId) {
      return NextResponse.json({ error: "Usuario requerido" }, { status: 400 });
    }

    const requesterAccountOwnerId = requester?.account_owner_id ?? user.id;
    const admin = supabaseAuthAdmin();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }

    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const targetRole = normalizeRole(target.role);
    if (requesterRole !== "super_admin") {
      if (
        target.account_owner_id !== requesterAccountOwnerId ||
        targetRole === "super_admin"
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (target.status !== "invited") {
      return NextResponse.json(
        { error: "Solo se puede reenviar a usuarios invitados" },
        { status: 400 },
      );
    }

    if (!target.email || !isValidEmail(target.email)) {
      return NextResponse.json(
        { error: "El usuario no tiene un correo valido" },
        { status: 400 },
      );
    }

    const origin = getOrigin(request);
    const inviteOptions = {
      data: {
        full_name: target.full_name || target.email,
        role: targetRole,
      },
      redirectTo: `${origin}/dashboard`,
    };

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      target.email,
      inviteOptions,
    );

    if (!inviteError) {
      return NextResponse.json({
        user: target,
        message: "Invitacion reenviada",
      });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email: target.email,
      options: inviteOptions,
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json(
        {
          error:
            inviteError.message ??
            linkError?.message ??
            "No se pudo reenviar la invitacion",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: target,
      invitation_link: linkData.properties.action_link,
      message:
        "Supabase no pudo enviar el correo, pero se genero un link de invitacion",
    });
  }

  const email = cleanEmail(body?.email);
  const fullName = cleanText(body?.full_name) || email;
  const role = APP_ROLES.includes(body?.role) ? (body.role as AppRole) : "staff";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email invalido" }, { status: 400 });
  }

  if (!INVITABLE_BY_ROLE[requesterRole].includes(role)) {
    return NextResponse.json({ error: "Rol no permitido" }, { status: 403 });
  }

  const accountOwnerId = requester?.account_owner_id ?? user.id;
  const admin = supabaseAuthAdmin();
  const origin = getOrigin(request);

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
      redirectTo: `${origin}/dashboard`,
    });

  if (inviteError || !inviteData.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? "No se pudo enviar la invitacion" },
      { status: 500 },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: inviteData.user.id,
        account_owner_id: accountOwnerId,
        invited_by: user.id,
        full_name: fullName,
        email,
        role,
        status: "invited",
      },
      { onConflict: "user_id" },
    )
    .select(PROFILE_SELECT)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Invitacion enviada, pero no se pudo guardar el perfil" },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: profile });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requester = await getRequesterProfile(supabase, user.id);
  if (!hasPermission(requester?.role, "manage_users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requesterRole = normalizeRole(requester?.role);
  const requesterAccountOwnerId = requester?.account_owner_id ?? user.id;
  const body = await request.json().catch(() => null);
  const targetUserId = cleanText(body?.user_id, 80);

  if (!targetUserId) {
    return NextResponse.json({ error: "Usuario requerido" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol o estado" },
      { status: 400 },
    );
  }

  const updates: { role?: AppRole; status?: string } = {};
  if (typeof body?.role === "string") {
    const nextRole = normalizeRole(body.role);
    if (!INVITABLE_BY_ROLE[requesterRole].includes(nextRole)) {
      return NextResponse.json({ error: "Rol no permitido" }, { status: 403 });
    }
    updates.role = nextRole;
  }

  if (typeof body?.status === "string") {
    if (!["active", "invited", "disabled"].includes(body.status)) {
      return NextResponse.json({ error: "Estado no permitido" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Sin cambios para guardar" }, { status: 400 });
  }

  const admin = supabaseAuthAdmin();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("user_id, account_owner_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const targetRole = normalizeRole(target.role);
  if (requesterRole !== "super_admin") {
    if (target.account_owner_id !== requesterAccountOwnerId || targetRole === "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update(updates)
    .eq("user_id", targetUserId)
    .select(PROFILE_SELECT)
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "No se pudo actualizar el usuario" },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: updated });
}
