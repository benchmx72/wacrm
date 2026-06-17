'use client';

import { useState } from 'react';
import { SophiaLogo } from '@/components/brand/sophia-logo';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/hooks/use-language';

export default function AccountSuspendedPage() {
  const { t } = useLanguage();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      <section className="border-border bg-card w-full max-w-lg rounded-lg border p-6 text-center shadow-2xl shadow-black/20 sm:p-8">
        <SophiaLogo className="mx-auto h-10 w-[154px]" />
        <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 text-xl text-amber-300">
          !
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          {t('accountSuspended.title')}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {t('accountSuspended.description')}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t('accountSuspended.contact')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          disabled={signingOut}
          onClick={signOut}
        >
          {signingOut
            ? t('accountSuspended.signingOut')
            : t('accountSuspended.signOut')}
        </Button>
      </section>
    </main>
  );
}
