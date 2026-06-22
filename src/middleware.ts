import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  canAccessPath,
  hasPermission,
  type AppPermission,
} from '@/lib/auth/roles';

const protectedPaths = [
  '/dashboard',
  '/inbox',
  '/contacts',
  '/pipelines',
  '/appointments',
  '/broadcasts',
  '/automations',
  '/flows',
  '/ai-playground',
  '/clients',
  '/settings',
  '/account-suspended',
];

const protectedApiRules: Array<{
  path: string;
  permission: AppPermission;
}> = [
  { path: '/api/team', permission: 'manage_users' },
  { path: '/api/admin/accounts', permission: 'manage_accounts' },
  { path: '/api/demo', permission: 'use_demo_tools' },
  { path: '/api/ai/settings', permission: 'manage_ai' },
  { path: '/api/ai/agent', permission: 'view_ai_playground' },
  { path: '/api/ai/inbox', permission: 'send_messages' },
  { path: '/api/conversations', permission: 'send_messages' },
  { path: '/api/whatsapp/config', permission: 'manage_whatsapp' },
  { path: '/api/whatsapp/templates', permission: 'manage_templates' },
  { path: '/api/whatsapp/broadcast', permission: 'view_broadcasts' },
  { path: '/api/whatsapp/send', permission: 'send_messages' },
  { path: '/api/whatsapp/react', permission: 'send_messages' },
  { path: '/api/whatsapp/media', permission: 'view_inbox' },
  { path: '/api/telegram/config', permission: 'manage_whatsapp' },
  { path: '/api/telegram/broadcast', permission: 'view_broadcasts' },
  { path: '/api/telegram/send', permission: 'send_messages' },
  { path: '/api/telegram/media', permission: 'view_inbox' },
  { path: '/api/appointments', permission: 'manage_appointments' },
  { path: '/api/automations', permission: 'view_automations' },
  { path: '/api/flows', permission: 'view_flows' },
];

function pathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function apiPermissionFor(pathname: string) {
  if (
    pathname === '/api/whatsapp/webhook' ||
    pathname === '/api/telegram/webhook' ||
    pathname === '/api/automations/cron' ||
    pathname === '/api/flows/cron' ||
    pathMatches(pathname, '/api/appointments/notifications')
  ) {
    return null;
  }

  return protectedApiRules.find((rule) => pathMatches(pathname, rule.path));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth pages - redirect to dashboard if already logged in
  if (
    user &&
    (pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/forgot-password')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  const isProtectedPage = protectedPaths.some((path) =>
    pathMatches(pathname, path)
  );
  const isApiRequest = pathname.startsWith('/api/');
  const isAccountSuspendedPage = pathname === '/account-suspended';
  const apiRule = apiPermissionFor(pathname);

  // Protected pages - redirect to login if not authenticated
  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!user && apiRule) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user && (isProtectedPage || isApiRequest)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status, account_owner_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.status === 'disabled') {
      if (apiRule) {
        return NextResponse.json({ error: 'User disabled' }, { status: 403 });
      }
      return supabaseResponse;
    }

    if (!hasPermission(profile?.role, 'manage_accounts')) {
      const accountOwnerId = profile?.account_owner_id ?? user.id;
      const { data: account } = await supabase
        .from('accounts')
        .select('status')
        .eq('owner_user_id', accountOwnerId)
        .maybeSingle();

      if (account?.status === 'suspended') {
        if (isApiRequest) {
          return NextResponse.json(
            { error: 'Account suspended' },
            { status: 403 }
          );
        }

        if (!isAccountSuspendedPage) {
          const url = request.nextUrl.clone();
          url.pathname = '/account-suspended';
          url.search = '';
          return NextResponse.redirect(url);
        }
      } else if (isAccountSuspendedPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    } else if (isAccountSuspendedPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    if (isProtectedPage && !canAccessPath(profile?.role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    if (apiRule) {
      if (!profile?.role) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (!hasPermission(profile.role, apiRule.permission)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
