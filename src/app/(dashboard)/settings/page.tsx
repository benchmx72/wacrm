'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Settings, MessageSquare, Tag, User, Palette, Users, Send, RadioTower, Loader2, CalendarDays } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TelegramConfig } from '@/components/settings/telegram-config';
import { MessagingChannelPanel } from '@/components/settings/messaging-channel-panel';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { AiAgentPanel } from '@/components/settings/ai-agent-panel';
import { TeamPanel } from '@/components/settings/team-panel';
import { AppointmentSettingsPanel } from '@/components/settings/appointment-settings-panel';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import type { AppPermission } from '@/lib/auth/roles';
import { hasPermission } from '@/lib/auth/roles';

const TAB_VALUES = [
  'profile',
  'channel',
  'whatsapp',
  'telegram',
  'templates',
  'tags',
  'appointments',
  'ai',
  'team',
  'appearance',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TAB_PERMISSIONS: Record<TabValue, AppPermission> = {
  profile: 'view_settings',
  channel: 'use_demo_tools',
  whatsapp: 'manage_whatsapp',
  telegram: 'manage_whatsapp',
  templates: 'manage_templates',
  tags: 'manage_tags',
  appointments: 'manage_appointments',
  ai: 'manage_ai',
  team: 'manage_users',
  appearance: 'manage_appearance',
};

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { profile, profileLoading } = useAuth();
  const messagingChannel = profile?.messaging_channel ?? 'whatsapp';

  // The URL is the single source of truth for the active tab — no
  // local state, no sync effect. A previous revision duplicated this
  // into `useState` + a sync effect, which tripped React 19's
  // set-state-in-effect rule and was also redundant.
  const queryTab = searchParams.get('tab');
  const requestedTab: TabValue = isTabValue(queryTab) ? queryTab : 'profile';
  const visibleTabs = TAB_VALUES.filter((value) => {
    if (!hasPermission(profile?.role, TAB_PERMISSIONS[value])) return false;
    if (value === 'whatsapp') return messagingChannel === 'whatsapp';
    if (value === 'telegram') return messagingChannel === 'telegram';
    if (value === 'templates') return messagingChannel === 'whatsapp';
    return true;
  });
  const tab: TabValue = visibleTabs.includes(requestedTab) ? requestedTab : 'profile';

  useEffect(() => {
    if (profileLoading || requestedTab === tab) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [profileLoading, requestedTab, router, searchParams, tab]);

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  if (profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {t('settings.description')}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="bg-slate-900 border border-slate-700">
          <TabsTrigger
            value="profile"
            className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
          >
            <User className="size-4" />
            {t('settings.tabs.profile')}
          </TabsTrigger>
          {hasPermission(profile?.role, 'use_demo_tools') && (
            <TabsTrigger
              value="channel"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <RadioTower className="size-4" />
              {t('settings.tabs.channel')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_whatsapp') && (
            messagingChannel === 'whatsapp' ? (
              <TabsTrigger
                value="whatsapp"
                className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
              >
                <Settings className="size-4" />
                {t('settings.tabs.whatsapp')}
              </TabsTrigger>
            ) : (
              <TabsTrigger
                value="telegram"
                className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
              >
                <Send className="size-4" />
                {t('settings.tabs.telegram')}
              </TabsTrigger>
            )
          )}
          {hasPermission(profile?.role, 'manage_templates') && messagingChannel === 'whatsapp' && (
            <TabsTrigger
              value="templates"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <MessageSquare className="size-4" />
              {t('settings.tabs.templates')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_tags') && (
            <TabsTrigger
              value="tags"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <Tag className="size-4" />
              {t('settings.tabs.tags')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_appointments') && (
            <TabsTrigger
              value="appointments"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <CalendarDays className="size-4" />
              {t('settings.tabs.appointments')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_ai') && (
            <TabsTrigger
              value="ai"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <Bot className="size-4" />
              {t('settings.tabs.ai')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_users') && (
            <TabsTrigger
              value="team"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <Users className="size-4" />
              {t('settings.tabs.team')}
            </TabsTrigger>
          )}
          {hasPermission(profile?.role, 'manage_appearance') && (
            <TabsTrigger
              value="appearance"
              className="data-active:bg-slate-800 data-active:text-primary text-slate-400"
            >
              <Palette className="size-4" />
              {t('settings.tabs.appearance')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        {hasPermission(profile?.role, 'use_demo_tools') && (
          <TabsContent value="channel">
            <MessagingChannelPanel />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_whatsapp') && messagingChannel === 'whatsapp' && (
          <TabsContent value="whatsapp">
            <WhatsAppConfig />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_whatsapp') && messagingChannel === 'telegram' && (
          <TabsContent value="telegram">
            <TelegramConfig />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_templates') && messagingChannel === 'whatsapp' && (
          <TabsContent value="templates">
            <TemplateManager />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_tags') && (
          <TabsContent value="tags">
            <TagManager />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_appointments') && (
          <TabsContent value="appointments">
            <AppointmentSettingsPanel />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_ai') && (
          <TabsContent value="ai">
            <AiAgentPanel />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_users') && (
          <TabsContent value="team">
            <TeamPanel />
          </TabsContent>
        )}

        {hasPermission(profile?.role, 'manage_appearance') && (
          <TabsContent value="appearance">
            <AppearancePanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
