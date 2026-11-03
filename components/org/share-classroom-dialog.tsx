'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';

interface GrantRow {
  userId: string;
  email: string;
  displayName: string;
}

interface ShareClassroomDialogProps {
  stageId: string | null;
  stageName: string;
  onClose: () => void;
}

const FIELD_CLASS = 'w-full rounded-md border bg-background px-3 py-2 text-sm';

/** Partage d'UNE formation avec UNE personne : elle ne rejoint pas l'organisation et ne voit rien d'autre. */
export function ShareClassroomDialog({ stageId, stageName, onClose }: ShareClassroomDialogProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const endpoint = stageId ? `/api/classroom/${encodeURIComponent(stageId)}/grants` : null;

  const loadGrants = useCallback(async () => {
    if (!endpoint) return;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { grants?: GrantRow[] };
      setGrants(payload.grants ?? []);
    } catch {
      toast.error(t('share.person.loadFailed'));
    }
  }, [endpoint, t]);

  useEffect(() => {
    setEmail('');
    setGrants([]);
    void loadGrants();
  }, [loadGrants]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!endpoint || !email.trim() || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 404) {
        toast.error(t('share.person.noAccount'));
        return;
      }
      if (response.status === 403) {
        toast.error(t('share.person.forbidden'));
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { status?: string };
      toast.success(
        payload.status === 'already'
          ? t('share.person.already')
          : t('share.person.done', { email: email.trim() }),
      );
      setEmail('');
      await loadGrants();
    } catch {
      toast.error(t('share.person.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (userId: string) => {
    if (!endpoint) return;
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success(t('share.person.revoked'));
      await loadGrants();
    } catch {
      toast.error(t('share.person.revokeFailed'));
    }
  };

  return (
    <Dialog open={stageId !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent data-testid="share-classroom-dialog">
        <DialogHeader>
          <DialogTitle>{t('share.person.title')}</DialogTitle>
          <DialogDescription>{stageName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t('share.person.description')}</p>
          <label className="block space-y-1">
            <span>{t('share.person.emailLabel')}</span>
            <input
              type="email"
              autoComplete="off"
              className={FIELD_CLASS}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="share-person-email"
            />
          </label>
          <Button
            type="submit"
            disabled={!email.trim() || submitting}
            data-testid="share-person-add"
          >
            {submitting ? t('share.person.adding') : t('share.person.add')}
          </Button>
        </form>
        <section className="space-y-2 text-sm" aria-label={t('share.person.listTitle')}>
          <h3 className="font-medium">{t('share.person.listTitle')}</h3>
          {grants.length === 0 ? (
            <p className="text-muted-foreground">{t('share.person.empty')}</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="share-person-list">
              {grants.map((grant) => (
                <li
                  key={grant.userId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate">{grant.email || grant.displayName}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void revoke(grant.userId)}
                  >
                    {t('share.person.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('share.person.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
