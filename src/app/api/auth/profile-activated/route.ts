import { NextResponse } from 'next/server';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAuthAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ status: 'active' })
    .eq('user_id', user.id)
    .eq('status', 'invited');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
