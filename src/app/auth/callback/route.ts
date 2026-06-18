import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  const redirectUrl = new URL(next, url.origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectUrl);
    }
    redirectUrl.searchParams.set('error', error.message);
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.pathname = '/login';
  redirectUrl.searchParams.set('error', 'No se pudo validar el enlace.');
  return NextResponse.redirect(redirectUrl);
}
