"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { canAccessPath } from "@/lib/auth/roles";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || profileLoading || !user) return;
    if (!canAccessPath(profile?.role, pathname)) {
      router.replace("/dashboard");
    }
  }, [user, profile?.role, loading, profileLoading, pathname, router]);

  if (loading || (user && profileLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-slate-400">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (profile?.status === "disabled") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center shadow-xl">
          <h1 className="text-xl font-semibold text-white">Acceso desactivado</h1>
          <p className="mt-2 text-sm text-slate-400">
            Tu usuario esta desactivado. Contacta al administrador del CRM para
            recuperar el acceso.
          </p>
          <Button type="button" onClick={signOut} className="mt-5">
            Cerrar sesion
          </Button>
        </div>
      </div>
    );
  }

  if (!canAccessPath(profile?.role, pathname)) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
