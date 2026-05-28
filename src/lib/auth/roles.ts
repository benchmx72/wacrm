export const APP_ROLES = [
  "super_admin",
  "client_admin",
  "staff",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AppPermission =
  | "view_dashboard"
  | "view_inbox"
  | "view_contacts"
  | "view_pipelines"
  | "view_appointments"
  | "view_broadcasts"
  | "view_automations"
  | "view_flows"
  | "view_ai_playground"
  | "view_settings"
  | "manage_contacts"
  | "manage_pipelines"
  | "manage_appointments"
  | "send_messages"
  | "manage_ai"
  | "manage_whatsapp"
  | "manage_templates"
  | "manage_tags"
  | "manage_appearance"
  | "manage_users"
  | "use_demo_tools";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  client_admin: "Admin cliente",
  staff: "Staff",
  viewer: "Solo lectura",
};

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  super_admin: [
    "view_dashboard",
    "view_inbox",
    "view_contacts",
    "view_pipelines",
    "view_appointments",
    "view_broadcasts",
    "view_automations",
    "view_flows",
    "view_ai_playground",
    "view_settings",
    "manage_contacts",
    "manage_pipelines",
    "manage_appointments",
    "send_messages",
    "manage_ai",
    "manage_whatsapp",
    "manage_templates",
    "manage_tags",
    "manage_appearance",
    "manage_users",
    "use_demo_tools",
  ],
  client_admin: [
    "view_dashboard",
    "view_inbox",
    "view_contacts",
    "view_pipelines",
    "view_appointments",
    "view_broadcasts",
    "view_automations",
    "view_flows",
    "view_settings",
    "manage_contacts",
    "manage_pipelines",
    "manage_appointments",
    "send_messages",
    "manage_ai",
    "manage_whatsapp",
    "manage_templates",
    "manage_tags",
    "manage_appearance",
    "manage_users",
  ],
  staff: [
    "view_dashboard",
    "view_inbox",
    "view_contacts",
    "view_appointments",
    "view_settings",
    "manage_contacts",
    "manage_appointments",
    "send_messages",
  ],
  viewer: [
    "view_dashboard",
    "view_inbox",
    "view_contacts",
    "view_pipelines",
    "view_appointments",
    "view_settings",
  ],
};

export const PATH_PERMISSIONS: Array<{
  path: string;
  permission: AppPermission;
}> = [
  { path: "/ai-playground", permission: "view_ai_playground" },
  { path: "/automations", permission: "view_automations" },
  { path: "/flows", permission: "view_flows" },
  { path: "/broadcasts", permission: "view_broadcasts" },
  { path: "/pipelines", permission: "view_pipelines" },
  { path: "/appointments", permission: "view_appointments" },
  { path: "/contacts", permission: "view_contacts" },
  { path: "/inbox", permission: "view_inbox" },
  { path: "/settings", permission: "view_settings" },
  { path: "/dashboard", permission: "view_dashboard" },
];

export function normalizeRole(role?: string | null): AppRole {
  if (role === "user" || role === "owner") return "super_admin";
  if (role === "admin") return "client_admin";
  if (role === "agent") return "staff";
  if (role === "read_only") return "viewer";
  if (APP_ROLES.includes(role as AppRole)) return role as AppRole;
  return "client_admin";
}

export function hasPermission(
  role: string | null | undefined,
  permission: AppPermission,
) {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission);
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  const rule = PATH_PERMISSIONS.find(({ path }) =>
    pathname === path || pathname.startsWith(`${path}/`),
  );
  return rule ? hasPermission(role, rule.permission) : true;
}
