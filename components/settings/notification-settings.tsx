'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, Smartphone, MessageCircle, Check, X, HelpCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import {
  loadPreferences,
  savePreferences,
  requestPushPermission,
  getPushPermissionState,
  type NotificationPreferences,
} from '@/lib/notifications';

type PushState = NotificationPermission | 'unsupported';

export function NotificationSettings(): React.ReactElement {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    email: false,
    push: false,
    whatsapp: false,
  });
  const [pushState, setPushState] = useState<PushState>('default');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
    setPushState(getPushPermissionState());
  }, []);

  const handleSave = useCallback(() => {
    savePreferences(prefs);
    toast.success(t('notifications.saved'));
  }, [prefs, t]);

  const handleToggle = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      const updated = { ...prefs, [key]: value };
      setPrefs(updated);
      savePreferences(updated);
    },
    [prefs],
  );

  const handleRequestPush = useCallback(async () => {
    setRequesting(true);
    try {
      const granted = await requestPushPermission();
      setPushState(getPushPermissionState());
      if (granted) {
        handleToggle('push', true);
      }
    } finally {
      setRequesting(false);
    }
  }, [handleToggle]);

  const pushPermissionLabel = (): { text: string; icon: React.ReactNode } => {
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
          text: 'Non supporté',
          icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
        };
      default:
        return {
          text: t('notifications.pushEnable'),
          icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
        };
    }
  };

  const pushInfo = pushPermissionLabel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{t('notifications.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('notifications.description')}
          </p>
        </div>
      </div>

      {/* Email toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <Label className="text-sm font-medium">{t('notifications.email')}</Label>
            <p className="text-xs text-muted-foreground">{t('notifications.emailDesc')}</p>
          </div>
        </div>
        <Switch
          checked={prefs.email}
          onCheckedChange={(v) => handleToggle('email', v)}
        />
      </div>

      {/* Push toggle */}
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
            checked={prefs.push}
            onCheckedChange={(v) => handleToggle('push', v)}
            disabled={pushState === 'denied' || pushState === 'unsupported'}
          />
        </div>

        {/* Push permission state */}
        <div className="flex items-center gap-2 text-sm">
          {pushInfo.icon}
          <span className="text-muted-foreground">{pushInfo.text}</span>
        </div>

        {/* Enable push button if not yet granted */}
        {pushState === 'default' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestPush}
            disabled={requesting}
          >
            {requesting ? '...' : t('notifications.pushEnable')}
          </Button>
        )}
      </div>

      {/* WhatsApp toggle */}
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
            checked={prefs.whatsapp}
            onCheckedChange={(v) => handleToggle('whatsapp', v)}
          />
        </div>

        {/* Phone number input shown only when WhatsApp is on */}
        {prefs.whatsapp && (
          <div className="ml-8 space-y-1">
            <Label className="text-xs font-medium">{t('notifications.whatsappNumber')}</Label>
            <Input
              type="tel"
              dir="ltr"
              placeholder={t('notifications.whatsappPlaceholder')}
              value={prefs.whatsappNumber ?? ''}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, whatsappNumber: e.target.value }))
              }
              className="max-w-xs"
            />
          </div>
        )}
      </div>

      {/* Save button */}
      <Button onClick={handleSave}>{t('notifications.savePreferences')}</Button>
    </div>
  );
}
