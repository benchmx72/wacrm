import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { hasPermission } from '@/lib/auth/roles';
import { sendInvitationEmail } from '@/lib/email/invitations';

const PROFILE_SELECT =
  'user_id, account_owner_id, full_name, email, role, status, messaging_channel, created_at';

const ACCOUNT_STATUSES = ['setup', 'active', 'suspended'] as const;
const ACCOUNT_LOCALES = ['es-419', 'pt-BR'] as const;
const MESSAGING_CHANNELS = ['whatsapp', 'telegram'] as const;

async function authorizeAccountManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: requester, error: requesterError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (requesterError) {
    return {
      error: NextResponse.json(
        { error: requesterError.message },
        { status: 500 }
      ),
    };
  }

  if (!hasPermission(requester?.role, 'manage_accounts')) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { admin: supabaseAuthAdmin(), requesterUserId: user.id };
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
    new URL(request.url).origin
  );
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAccountManager();
  if (authorization.error) return authorization.error;

  const body = await request.json().catch(() => null);

  if (body?.action === 'resend_invitation') {
    const accountId = cleanText(body?.account_id);
    if (!accountId) {
      return NextResponse.json({ error: 'Account required' }, { status: 400 });
    }

    const { admin } = authorization;
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('owner_user_id')
      .eq('id', accountId)
      .maybeSingle();

    if (accountError) {
      return NextResponse.json(
        { error: accountError.message },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { data: owner, error: ownerError } = await admin
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('user_id', account.owner_user_id)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 500 });
    }

    if (!owner || owner.status !== 'invited') {
      return NextResponse.json(
        { error: 'Only invited administrators can receive a new invitation' },
        { status: 400 }
      );
    }

    if (!owner.email || !isValidEmail(owner.email)) {
      return NextResponse.json(
        { error: 'Administrator email is invalid' },
        { status: 400 }
      );
    }

    const inviteOptions = {
      data: {
        full_name: owner.full_name || owner.email,
        role: 'client_admin',
      },
      redirectTo: `${getOrigin(request)}/auth/callback?next=/reset-password`,
    };

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: 'invite',
        email: owner.email,
        options: inviteOptions,
      });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json(
        {
          error:
            linkError?.message ||
            'Could not resend invitation',
        },
        { status: 500 }
      );
    }

    try {
      const emailResult = await sendInvitationEmail({
        to: owner.email,
        fullName: owner.full_name || owner.email,
        roleLabel: 'Admin cliente',
        actionLink: linkData.properties.action_link,
      });

      return NextResponse.json({
        invitation_link: emailResult.sent ? undefined : linkData.properties.action_link,
        message: emailResult.sent
          ? 'Invitation resent'
          : 'Invitation link generated',
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Could not send invitation email',
          invitation_link: linkData.properties.action_link,
        },
        { status: 500 }
      );
    }
  }

  const name = cleanText(body?.name);
  const industry = cleanText(body?.industry);
  const adminName = cleanText(body?.admin_name);
  const adminEmail = cleanEmail(body?.admin_email);
  const status = body?.status;
  const locale = body?.locale;
  const timezone = cleanText(body?.timezone);
  const messagingChannel = body?.messaging_channel;

  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: 'Invalid account name' },
      { status: 400 }
    );
  }

  if (industry.length > 120) {
    return NextResponse.json({ error: 'Invalid industry' }, { status: 400 });
  }

  if (!adminName || adminName.length > 120 || !isValidEmail(adminEmail)) {
    return NextResponse.json(
      { error: 'Invalid administrator data' },
      { status: 400 }
    );
  }

  if (!ACCOUNT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid account status' },
      { status: 400 }
    );
  }

  if (!ACCOUNT_LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  if (!timezone || !isValidTimezone(timezone)) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  }

  if (!MESSAGING_CHANNELS.includes(messagingChannel)) {
    return NextResponse.json(
      { error: 'Invalid messaging channel' },
      { status: 400 }
    );
  }

  const { admin, requesterUserId } = authorization;
  const inviteOptions = {
    data: { full_name: adminName, role: 'client_admin' },
    redirectTo: `${getOrigin(request)}/auth/callback?next=/reset-password`,
  };

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: 'invite',
      email: adminEmail,
      options: inviteOptions,
    });

  if (inviteError || !inviteData?.user || !inviteData.properties?.action_link) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Could not generate administrator invitation' },
      { status: 500 }
    );
  }

  const ownerUserId = inviteData.user.id;

  const cleanupInvitation = async () => {
    const { error } = await admin.auth.admin.deleteUser(ownerUserId);
    if (error) {
      console.error('[admin/accounts] invitation cleanup failed', error);
    }
  };

  const { data: ownerProfile, error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        user_id: ownerUserId,
        account_owner_id: ownerUserId,
        invited_by: requesterUserId,
        full_name: adminName,
        email: adminEmail,
        role: 'client_admin',
        status: 'invited',
        messaging_channel: messagingChannel,
      },
      { onConflict: 'user_id' }
    )
    .select(PROFILE_SELECT)
    .single();

  if (profileError || !ownerProfile) {
    await cleanupInvitation();
    return NextResponse.json(
      { error: profileError?.message ?? 'Could not create administrator' },
      { status: 500 }
    );
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .insert({
      owner_user_id: ownerUserId,
      name,
      industry: industry || null,
      status,
      locale,
      timezone,
    })
    .select('*')
    .single();

  if (accountError || !account) {
    await cleanupInvitation();
    return NextResponse.json(
      { error: accountError?.message ?? 'Could not create account' },
      { status: 500 }
    );
  }

  try {
    const emailResult = await sendInvitationEmail({
      to: adminEmail,
      fullName: adminName,
      roleLabel: 'Admin cliente',
      actionLink: inviteData.properties.action_link,
    });

    return NextResponse.json(
      {
        account: {
          ...account,
          owner: {
            user_id: ownerProfile.user_id,
            full_name: ownerProfile.full_name,
            email: ownerProfile.email,
            status: ownerProfile.status,
            messaging_channel: ownerProfile.messaging_channel,
          },
          member_count: 1,
          active_member_count: 0,
        },
        invitation_link: emailResult.sent
          ? undefined
          : inviteData.properties.action_link,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Account created, but invitation email could not be sent',
        account: {
          ...account,
          owner: {
            user_id: ownerProfile.user_id,
            full_name: ownerProfile.full_name,
            email: ownerProfile.email,
            status: ownerProfile.status,
            messaging_channel: ownerProfile.messaging_channel,
          },
          member_count: 1,
          active_member_count: 0,
        },
        invitation_link: inviteData.properties.action_link,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const authorization = await authorizeAccountManager();
  if (authorization.error) return authorization.error;

  const { admin } = authorization;
  const [accountsResult, profilesResult] = await Promise.all([
    admin
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false }),
    admin.from('profiles').select(PROFILE_SELECT).order('created_at'),
  ]);

  if (accountsResult.error) {
    return NextResponse.json(
      { error: accountsResult.error.message },
      { status: 500 }
    );
  }

  if (profilesResult.error) {
    return NextResponse.json(
      { error: profilesResult.error.message },
      { status: 500 }
    );
  }

  type ProfileRow = NonNullable<typeof profilesResult.data>[number];
  const profilesByAccount = new Map<string, ProfileRow[]>();
  for (const profile of profilesResult.data ?? []) {
    if (!profile.account_owner_id) continue;
    const members = profilesByAccount.get(profile.account_owner_id) ?? [];
    members.push(profile);
    profilesByAccount.set(profile.account_owner_id, members);
  }

  const accounts = (accountsResult.data ?? []).map((account) => {
    const members = profilesByAccount.get(account.owner_user_id) ?? [];
    const owner =
      members.find((member) => member.user_id === account.owner_user_id) ??
      null;

    return {
      ...account,
      owner: owner
        ? {
            user_id: owner.user_id,
            full_name: owner.full_name,
            email: owner.email,
            status: owner.status,
            messaging_channel: owner.messaging_channel,
          }
        : null,
      member_count: members.length,
      active_member_count: members.filter(
        (member) => member.status === 'active'
      ).length,
    };
  });

  return NextResponse.json({ accounts });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAccountManager();
  if (authorization.error) return authorization.error;

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const industry =
    typeof body?.industry === 'string' ? body.industry.trim() : '';
  const status = body?.status;
  const locale = body?.locale;
  const timezone =
    typeof body?.timezone === 'string' ? body.timezone.trim() : '';
  const messagingChannel = body?.messaging_channel;

  if (!id || !name || name.length > 120) {
    return NextResponse.json(
      { error: 'Invalid account name' },
      { status: 400 }
    );
  }

  if (industry.length > 120) {
    return NextResponse.json({ error: 'Invalid industry' }, { status: 400 });
  }

  if (!ACCOUNT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid account status' },
      { status: 400 }
    );
  }

  if (!ACCOUNT_LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  if (!timezone || !isValidTimezone(timezone)) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  }

  if (!MESSAGING_CHANNELS.includes(messagingChannel)) {
    return NextResponse.json(
      { error: 'Invalid messaging channel' },
      { status: 400 }
    );
  }

  const { admin } = authorization;
  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, owner_user_id')
    .eq('id', id)
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ messaging_channel: messagingChannel })
    .eq('user_id', account.owner_user_id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { data: updatedAccount, error: updateError } = await admin
    .from('accounts')
    .update({
      name,
      industry: industry || null,
      status,
      locale,
      timezone,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    account: {
      ...updatedAccount,
      messaging_channel: messagingChannel,
    },
  });
}
