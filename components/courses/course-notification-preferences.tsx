'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';

type Preferences = {
  pausedUntil: string | null;
  dailyCap: number | null;
  nextReminderAt: string | null;
  minimumIntervalHours: 24 | 72 | 168 | null;
  timezone: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  disabled: boolean;
};

function toLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function CourseNotificationPreferences({
  courseId,
}: {
  courseId: string;
}): React.ReactElement {
  const { t, locale } = useI18n();
  const [preferences, setPreferences] = useState<Preferences>({
    pausedUntil: null,
    dailyCap: null,
    nextReminderAt: null,
    minimumIntervalHours: null,
    timezone: null,
    quietStart: null,
    quietEnd: null,
    disabled: false,
  });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/courses/${encodeURIComponent(courseId)}/notification-preferences`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Course preferences request failed');
        const body = (await response.json()) as Partial<Preferences>;
        setPreferences({
          pausedUntil: typeof body.pausedUntil === 'string' ? body.pausedUntil : null,
          dailyCap: typeof body.dailyCap === 'number' ? body.dailyCap : null,
          nextReminderAt: typeof body.nextReminderAt === 'string' ? body.nextReminderAt : null,
          minimumIntervalHours:
            body.minimumIntervalHours === 24 ||
            body.minimumIntervalHours === 72 ||
            body.minimumIntervalHours === 168
              ? body.minimumIntervalHours
              : null,
          timezone: typeof body.timezone === 'string' ? body.timezone : null,
          quietStart: typeof body.quietStart === 'string' ? body.quietStart.slice(0, 5) : null,
          quietEnd: typeof body.quietEnd === 'string' ? body.quietEnd.slice(0, 5) : null,
          disabled: body.disabled === true,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) toast.error(t('notifications.courseLoadFailed'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [courseId, t]);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/notification-preferences`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pausedUntil: preferences.pausedUntil,
            dailyCap: preferences.dailyCap,
            minimumIntervalHours: preferences.minimumIntervalHours,
            timezone: preferences.timezone,
            quietStart: preferences.quietStart,
            quietEnd: preferences.quietEnd,
            disabled: preferences.disabled,
          }),
        },
      );
      if (!response.ok) throw new Error('Course preferences save failed');
      const body = (await response.json()) as Partial<Preferences>;
      setPreferences((current) => ({
        ...current,
        pausedUntil: typeof body.pausedUntil === 'string' ? body.pausedUntil : null,
        dailyCap: typeof body.dailyCap === 'number' ? body.dailyCap : null,
        nextReminderAt: typeof body.nextReminderAt === 'string' ? body.nextReminderAt : null,
        minimumIntervalHours:
          body.minimumIntervalHours === 24 ||
          body.minimumIntervalHours === 72 ||
          body.minimumIntervalHours === 168
            ? body.minimumIntervalHours
            : null,
        timezone: typeof body.timezone === 'string' ? body.timezone : null,
        quietStart: typeof body.quietStart === 'string' ? body.quietStart.slice(0, 5) : null,
        quietEnd: typeof body.quietEnd === 'string' ? body.quietEnd.slice(0, 5) : null,
        disabled: body.disabled === true,
      }));
      toast.success(t('notifications.courseSaved'));
    } catch {
      toast.error(t('notifications.courseSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    // Ancré en bas : en haut à droite, il recouvrait les boutons de l'en-tête (langue, thème, réglages).
    <div ref={rootRef} className="fixed bottom-20 end-3 z-20 flex flex-col items-end gap-2">
      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.courseTitle')}
          className="max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border bg-background p-3 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t('notifications.courseTitle')}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{t('notifications.courseDescription')}</p>
            <p className="text-xs text-muted-foreground">
              {preferences.disabled
                ? t('notifications.courseDisabledEffect')
                : preferences.pausedUntil
                  ? t('notifications.coursePausedEffect')
                  : preferences.nextReminderAt
                    ? t('notifications.courseNextReminder', {
                        date: new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(preferences.nextReminderAt)),
                      })
                    : t('notifications.courseNoReminder')}
            </p>
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={preferences.disabled}
                onCheckedChange={(checked) =>
                  setPreferences((current) => ({ ...current, disabled: checked === true }))
                }
                disabled={loading || saving}
                aria-label={t('notifications.courseDisable')}
              />
              <span>{t('notifications.courseDisable')}</span>
            </label>
            <div className="space-y-1">
              <Label htmlFor="course-notification-timezone" className="text-xs">
                {t('notifications.courseTimezone')}
              </Label>
              <Input
                id="course-notification-timezone"
                value={preferences.timezone ?? ''}
                placeholder={t('notifications.courseTimezoneInherited')}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    timezone: event.target.value.trim() || null,
                  }))
                }
                disabled={loading || saving || preferences.disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="course-notification-quiet-start" className="text-xs">
                  {t('notifications.courseQuietStart')}
                </Label>
                <Input
                  id="course-notification-quiet-start"
                  type="time"
                  value={preferences.quietStart ?? ''}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      quietStart: event.target.value || null,
                    }))
                  }
                  disabled={loading || saving || preferences.disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="course-notification-quiet-end" className="text-xs">
                  {t('notifications.courseQuietEnd')}
                </Label>
                <Input
                  id="course-notification-quiet-end"
                  type="time"
                  value={preferences.quietEnd ?? ''}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      quietEnd: event.target.value || null,
                    }))
                  }
                  disabled={loading || saving || preferences.disabled}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="course-notification-interval" className="text-xs">
                {t('notifications.courseFrequency')}
              </Label>
              <select
                id="course-notification-interval"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={preferences.minimumIntervalHours ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPreferences((current) => ({
                    ...current,
                    minimumIntervalHours:
                      value === 24 || value === 72 || value === 168 ? value : null,
                  }));
                }}
                disabled={loading || saving}
              >
                <option value="">{t('notifications.courseFrequencyDefault')}</option>
                <option value="24">{t('notifications.courseFrequencyDaily')}</option>
                <option value="72">{t('notifications.courseFrequencyEveryThreeDays')}</option>
                <option value="168">{t('notifications.courseFrequencyWeekly')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="course-notification-daily-cap" className="text-xs">
                {t('notifications.courseDailyCap')}
              </Label>
              <Input
                id="course-notification-daily-cap"
                type="number"
                min={1}
                max={10}
                value={preferences.dailyCap ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  const dailyCap = Number(value);
                  if (!value || (Number.isInteger(dailyCap) && dailyCap >= 1 && dailyCap <= 10)) {
                    setPreferences((current) => ({
                      ...current,
                      dailyCap: value ? dailyCap : null,
                    }));
                  }
                }}
                disabled={loading || saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="course-notification-paused-until" className="text-xs">
                {t('notifications.coursePauseUntil')}
              </Label>
              <Input
                id="course-notification-paused-until"
                type="datetime-local"
                value={toLocalDateTime(preferences.pausedUntil)}
                onChange={(event) => {
                  const date = event.target.value ? new Date(event.target.value) : null;
                  setPreferences((current) => ({
                    ...current,
                    pausedUntil: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
                  }));
                }}
                disabled={loading || saving}
              />
            </div>
            <div className="flex gap-2">
              {preferences.pausedUntil && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPreferences((current) => ({ ...current, pausedUntil: null }))}
                  disabled={loading || saving}
                >
                  {t('notifications.courseResume')}
                </Button>
              )}
              <Button type="button" size="sm" onClick={save} disabled={loading || saving}>
                {saving ? t('notifications.saving') : t('notifications.savePreferences')}
              </Button>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('notifications.courseTitle')}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-11 items-center justify-center rounded-full border bg-background shadow-md hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
      </button>
    </div>
  );
}
