'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, HelpCircle, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  checkAndNotifyDueCards,
  getPushPermissionState,
  loadPreferences,
  requestPushPermission,
  savePreferences,
  unsubscribeFromPush,
  type NotificationPreferences,
} from '@/lib/notifications';

type PushState = NotificationPermission | 'unsupported';

const DISABLED_PREFERENCES: NotificationPreferences = { push: false };

export function NotificationSettings(): React.ReactElement {
  const { t, locale } = useI18n();
  const { user, isLoading } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DISABLED_PREFERENCES);
  const [pushState, setPushState] = useState<PushState>('default');
  const [requesting, setRequesting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setPrefs(user ? loadPreferences(user.id) : DISABLED_PREFERENCES);
    setPushState(getPushPermissionState());
  }, [user]);

  const persist = useCallback(
    (updated: NotificationPreferences) => {
      if (!user) return;
      setPrefs(updated);
      savePreferences(user.id, updated);
    },
    [user],
  );

  const handleRequestPush = useCallback(async () => {
    if (!user) return;
    setRequesting(true);
    try {
      const granted = await requestPushPermission();
      setPushState(getPushPermissionState());
      if (granted) {
        persist({ push: true });
        void checkAndNotifyDueCards(user.id);
      }
    } finally {
      setRequesting(false);
    }
  }, [persist, user]);

  const permissionInfo = (): { text: string; icon: React.ReactNode } => {
    switch (pushState) {
      case 'granted':
        return {
          text: t('notifications.pushEnabled'),
          icon: <Check className="h-4 w-4 text-green-500" />,
        };
      case 'denied':
        return {
          text: t('notifications.pushDenied'),
          icon: <X className="h-4 w-4 text-destructive" />,
        };
      case 'unsupported':
        return {
          text: t('notifications.pushUnsupported'),
          icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
        };
      default:
        return {
          text: t('notifications.pushEnable'),
          icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
        };
    }
  };

  const pushInfo = permissionInfo();
  const canToggle = Boolean(user) && pushState === 'granted';
  const handleToggle = useCallback(
    async (push: boolean) => {
      if (!user) return;
      setRequesting(true);
      try {
        if (!push) {
          persist({ push: false });
          await unsubscribeFromPush();
          return;
        }
        const granted = await requestPushPermission();
        setPushState(getPushPermissionState());
        persist({ push: granted });
        if (granted) void checkAndNotifyDueCards(user.id);
      } finally {
        setRequesting(false);
      }
    },
    [persist, user],
  );

  const handleTestPush = useCallback(async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/push-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
        body: '{}',
      });
      if (!response.ok) throw new Error('Push test failed');
      toast.success(t('notifications.testPushSent'));
    } catch {
      toast.error(t('notifications.testPushFailed'));
    } finally {
      setTesting(false);
    }
  }, [locale, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{t('notifications.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('notifications.description')}</p>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">{t('notifications.push')}</Label>
              <p className="text-xs text-muted-foreground">{t('notifications.pushDesc')}</p>
            </div>
          </div>
          <Switch
            aria-label={t('notifications.push')}
            checked={prefs.push && canToggle}
            onCheckedChange={handleToggle}
            disabled={!canToggle || requesting}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          {pushInfo.icon}
          <span className="text-muted-foreground">
            {!isLoading && !user ? t('notifications.signInRequired') : pushInfo.text}
          </span>
        </div>

        {user && pushState === 'default' && (
          <Button variant="outline" size="sm" onClick={handleRequestPush} disabled={requesting}>
            {requesting ? t('notifications.enabling') : t('notifications.pushEnable')}
          </Button>
        )}

        {user && prefs.push && pushState === 'granted' && (
          <Button variant="outline" size="sm" onClick={handleTestPush} disabled={testing}>
            {testing ? t('notifications.testingPush') : t('notifications.testPush')}
          </Button>
        )}
      </div>

      <Button
        onClick={() => {
          if (!user) return;
          savePreferences(user.id, prefs);
          toast.success(t('notifications.saved'));
        }}
        disabled={!user}
      >
        {t('notifications.savePreferences')}
      </Button>
    </div>
  );
}
