'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomEditDelegationState } from '@/lib/server/classroom-edit-delegations';

const DURATION_OPTIONS = [
  { hours: 1, key: 'classroom.editAccess.duration1h' },
  { hours: 8, key: 'classroom.editAccess.duration8h' },
  { hours: 24, key: 'classroom.editAccess.duration24h' },
  { hours: 168, key: 'classroom.editAccess.duration7d' },
  { hours: 720, key: 'classroom.editAccess.duration30d' },
] as const;

export function ClassroomEditDelegation({
  classroomId,
  onAccessChanged,
}: {
  classroomId: string;
  onAccessChanged: () => void;
}): React.ReactElement | null {
  const { t, locale } = useI18n();
  const [state, setState] = useState<ClassroomEditDelegationState | null>(null);
  const [durationHours, setDurationHours] = useState(24);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/classroom/${encodeURIComponent(classroomId)}/edit-access`,
    );
    if (!response.ok) {
      setState(null);
      return;
    }
    const body = (await response.json()) as { editAccess?: ClassroomEditDelegationState };
    setState(body.editAccess ?? null);
  }, [classroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRequests = useMemo(() => {
    const now = Date.now();
    return (state?.requests ?? []).filter(
      (request) =>
        request.status === 'pending' ||
        (request.status === 'approved' &&
          request.expiresAt !== null &&
          Date.parse(request.expiresAt) > now),
    );
  }, [state]);

  const mutate = useCallback(
    async (method: 'POST' | 'PATCH', body?: Record<string, unknown>, requestId = 'request') => {
      setBusyId(requestId);
      try {
        const response = await fetch(
          `/api/classroom/${encodeURIComponent(classroomId)}/edit-access`,
          {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          },
        );
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error || t('classroom.editAccess.failed'));
        toast.success(t('classroom.editAccess.saved'));
        await load();
        onAccessChanged();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('classroom.editAccess.failed'));
      } finally {
        setBusyId(null);
      }
    },
    [classroomId, load, onAccessChanged, t],
  );

  if (!state || (!state.canRequest && !state.canManage)) return null;

  if (state.canRequest) {
    const pending = activeRequests.find((request) => request.status === 'pending');
    const approved = activeRequests.find((request) => request.status === 'approved');
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {approved?.expiresAt
              ? t('classroom.editAccess.activeUntil', {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(approved.expiresAt)),
                })
              : pending
                ? t('classroom.editAccess.pending')
                : t('classroom.editAccess.requestDescription')}
          </span>
        </div>
        {!pending && !approved && (
          <Button
            size="sm"
            onClick={() => void mutate('POST')}
            disabled={busyId !== null}
          >
            {t('classroom.editAccess.request')}
          </Button>
        )}
      </div>
    );
  }

  if (!activeRequests.length) return null;
  return (
    <div className="shrink-0 space-y-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
      {activeRequests.map((request) => (
        <div key={request.id} className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {request.status === 'pending'
                ? t('classroom.editAccess.pendingFrom', { name: request.requesterName })
                : t('classroom.editAccess.grantedToUntil', {
                    name: request.requesterName,
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(request.expiresAt!)),
                  })}
            </span>
          </div>
          {request.status === 'pending' ? (
            <div className="flex items-center gap-2">
              <Select
                value={String(durationHours)}
                onValueChange={(value) => setDurationHours(Number(value))}
              >
                <SelectTrigger className="h-8 w-32 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.hours} value={String(option.hours)}>
                      {t(option.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() =>
                  void mutate(
                    'PATCH',
                    { action: 'approve', requestId: request.id, durationHours },
                    request.id,
                  )
                }
                disabled={busyId !== null}
              >
                {t('classroom.editAccess.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void mutate(
                    'PATCH',
                    { action: 'reject', requestId: request.id },
                    request.id,
                  )
                }
                disabled={busyId !== null}
              >
                {t('classroom.editAccess.reject')}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void mutate('PATCH', { action: 'revoke', requestId: request.id }, request.id)
              }
              disabled={busyId !== null}
            >
              {t('classroom.editAccess.revoke')}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
