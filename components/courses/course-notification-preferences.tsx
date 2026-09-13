'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';

type Preferences = {
  pausedUntil: string | null;
  dailyCap: number | null;
  nextReminderAt: string | null;
  minimumIntervalHours: 24 | 72 | 168 | null;
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          body: JSON.stringify(preferences),
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
      }));
      toast.success(t('notifications.courseSaved'));
    } catch {
      toast.error(t('notifications.courseSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="absolute end-3 top-3 z-20 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4" />
        {t('notifications.courseTitle')}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t('notifications.courseDescription')}</p>
        <p className="text-xs text-muted-foreground">
          {preferences.pausedUntil
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
                minimumIntervalHours: value === 24 || value === 72 || value === 168 ? value : null,
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
                setPreferences((current) => ({ ...current, dailyCap: value ? dailyCap : null }));
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
    </details>
  );
}
