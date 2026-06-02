import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessPath, hasPermission, type AppPermission } from '@/lib/auth/roles'

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
  '/settings',
]

const protectedApiRules: Array<{
  path: string
  permission: AppPermission
}> = [
  { path: '/api/team', permission: 'manage_users' },
  { path: '/api/demo', permission: 'use_demo_tools' },
  { path: '/api/ai/settings', permission: 'manage_ai' },
  { path: '/api/ai/agent', permission: 'view_ai_playground' },
  { path: '/api/ai/inbox', permission: 'view_inbox' },
  { path: '/api/whatsapp/config', permission: 'manage_whatsapp' },
  { path: '/api/whatsapp/templates', permission: 'manage_templates' },
  { path: '/api/whatsapp/broadcast', permission: 'view_broadcasts' },
  { path: '/api/whatsapp/send', permission: 'send_messages' },
  { path: '/api/whatsapp/react', permission: 'send_messages' },
  { path: '/api/whatsapp/media', permission: 'view_inbox' },
  { path: '/api/appointments', permission: 'manage_appointments' },
  { path: '/api/automations', permission: 'view_automations' },
  { path: '/api/flows', permission: 'view_flows' },
]

function pathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

function apiPermissionFor(pathname: string) {
  if (
    pathname === '/api/whatsapp/webhook' ||
    pathname === '/api/automations/cron' ||
    pathname === '/api/flows/cron' ||
    pathMatches(pathname, '/api/appointments/notifications')
  ) {
    return null
  }

  return protectedApiRules.find((rule) => pathMatches(pathname, rule.path))
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Auth pages - redirect to dashboard if already logged in
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  const isProtectedPage = protectedPaths.some((path) =>
    pathMatches(request.nextUrl.pathname, path)
  )
  const apiRule = apiPermissionFor(request.nextUrl.pathname)

  // Protected pages - redirect to login if not authenticated
  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!user && apiRule) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (user && (isProtectedPage || apiRule)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.status === 'disabled') {
      if (apiRule) {
        return NextResponse.json({ error: 'User disabled' }, { status: 403 })
      }
      return supabaseResponse
    }

    if (isProtectedPage && !canAccessPath(profile?.role, request.nextUrl.pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (apiRule && !hasPermission(profile?.role, apiRule.permission)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
