'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, HelpCircle, Mail, MessageCircle, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';
import { translate } from '@/lib/i18n';
import {
  checkAndNotifyDueCards,
  getPushPermissionState,
  loadPreferences,
  requestPushPermission,
  savePreferences,
  unsubscribeFromPush,
  type NotificationPreferences,
} from '@/lib/notifications';
import { normalizeWhatsAppNumber } from '@/lib/notifications/whatsapp-number';

type PushState = NotificationPermission | 'unsupported';
type SettingsPreferences = NotificationPreferences & {
  email: boolean;
  whatsapp: boolean;
  whatsappNumber?: string;
};

const DISABLED_PREFERENCES: SettingsPreferences = {
  email: false,
  push: false,
  whatsapp: false,
};

export function NotificationSettings(): React.ReactElement {
  const { t, locale } = useI18n();
  const { user, isLoading } = useAuth();
  const [prefs, setPrefs] = useState<SettingsPreferences>(DISABLED_PREFERENCES);
  const [pushState, setPushState] = useState<PushState>('default');
  const [requesting, setRequesting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrefs(
      user ? { ...DISABLED_PREFERENCES, ...loadPreferences(user.id) } : DISABLED_PREFERENCES,
    );
    setPushState(getPushPermissionState());
    if (!user) return;

    let active = true;
    setLoadingChannels(true);
    void fetch('/api/notification-preferences')
      .then(async (response) => {
        if (!response.ok) throw new Error('Notification preferences request failed');
        const body = (await response.json()) as {
          email?: unknown;
          whatsapp?: unknown;
          whatsappNumber?: unknown;
        };
        if (!active) return;
        setPrefs((current) => ({
          ...current,
          email: body.email === true,
          whatsapp: body.whatsapp === true,
          ...(typeof body.whatsappNumber === 'string'
            ? { whatsappNumber: body.whatsappNumber }
            : { whatsappNumber: undefined }),
        }));
      })
      .catch(() => {
        if (active) toast.error(translate(locale, 'notifications.loadFailed'));
      })
      .finally(() => {
        if (active) setLoadingChannels(false);
      });
    return () => {
      active = false;
    };
  }, [locale, user]);

  const persist = useCallback(
    (updated: NotificationPreferences) => {
      if (!user) return;
      setPrefs((current) => ({ ...current, ...updated }));
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

  const normalizedWhatsAppNumber = prefs.whatsappNumber
    ? normalizeWhatsAppNumber(prefs.whatsappNumber)
    : null;
  const whatsappInvalid = prefs.whatsapp && !normalizedWhatsAppNumber;

  const handleSave = useCallback(async () => {
    if (!user || (prefs.whatsapp && !normalizedWhatsAppNumber)) return;
    setSaving(true);
    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: prefs.email,
          whatsapp: prefs.whatsapp,
          whatsappNumber: prefs.whatsapp ? normalizedWhatsAppNumber : null,
          locale,
        }),
      });
      if (!response.ok) throw new Error('Notification preferences save failed');
      savePreferences(user.id, { push: prefs.push });
      setPrefs((current) => ({
        ...current,
        ...(prefs.whatsapp && normalizedWhatsAppNumber
          ? { whatsappNumber: normalizedWhatsAppNumber }
          : { whatsappNumber: undefined }),
      }));
      toast.success(t('notifications.saved'));
    } catch {
      toast.error(t('notifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [locale, normalizedWhatsAppNumber, prefs, t, user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{t('notifications.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('notifications.description')}</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <Label className="text-sm font-medium">{t('notifications.email')}</Label>
            <p className="text-xs text-muted-foreground">{t('notifications.emailDesc')}</p>
          </div>
        </div>
        <Switch
          aria-label={t('notifications.email')}
          checked={prefs.email}
          onCheckedChange={(email) => setPrefs((current) => ({ ...current, email }))}
          disabled={!user || loadingChannels}
        />
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

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">{t('notifications.whatsapp')}</Label>
              <p className="text-xs text-muted-foreground">{t('notifications.whatsappDesc')}</p>
            </div>
          </div>
          <Switch
            aria-label={t('notifications.whatsapp')}
            checked={prefs.whatsapp}
            onCheckedChange={(whatsapp) => setPrefs((current) => ({ ...current, whatsapp }))}
            disabled={!user || loadingChannels}
          />
        </div>
        {prefs.whatsapp && (
          <div className="ms-8 space-y-1">
            <Label htmlFor="notification-whatsapp-number" className="text-xs font-medium">
              {t('notifications.whatsappNumber')}
            </Label>
            <Input
              id="notification-whatsapp-number"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t('notifications.whatsappPlaceholder')}
              value={prefs.whatsappNumber ?? ''}
              onChange={(event) =>
                setPrefs((current) => ({
                  ...current,
                  whatsappNumber: event.target.value,
                }))
              }
              aria-invalid={whatsappInvalid}
              className="max-w-xs"
            />
            {whatsappInvalid && (
              <p className="text-xs text-destructive">{t('notifications.whatsappInvalid')}</p>
            )}
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={!user || loadingChannels || saving || whatsappInvalid}>
        {saving ? t('notifications.saving') : t('notifications.savePreferences')}
      </Button>
    </div>
  );
}
