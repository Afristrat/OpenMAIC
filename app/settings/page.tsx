'use client';

import { useState } from 'react';
import { Settings, Volume2, Mic, Bell } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { GeneralSettings } from '@/components/settings/general-settings';
import { AudioSettings } from '@/components/settings/audio-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';

type UserSection = 'general' | 'audio' | 'notifications';

export default function SettingsPage(): React.ReactElement {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<UserSection>('general');

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-border/40">
          <button
            onClick={() => setActiveSection('general')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              activeSection === 'general'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Settings className="h-4 w-4" />
            {t('settings.systemSettings')}
          </button>

          <button
            onClick={() => setActiveSection('audio')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              activeSection === 'audio'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Volume2 className="h-4 w-4" />
            {t('settings.ttsSettings')}
            <Mic className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setActiveSection('notifications')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              activeSection === 'notifications'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Bell className="h-4 w-4" />
            {t('notifications.title')}
          </button>
        </div>

        {/* Content */}
        <div className="py-2">
          {activeSection === 'general' && <GeneralSettings />}
          {activeSection === 'audio' && <AudioSettings />}
          {activeSection === 'notifications' && <NotificationSettings />}
        </div>
      </div>
    </div>
  );
}
