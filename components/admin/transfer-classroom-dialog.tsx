'use client';

import { useEffect, useState } from 'react';
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

interface TenantOption {
  id: string;
  name: string;
  status: string;
}

interface OwnerOption {
  id: string;
  role: string;
  email: string | null;
}

interface TransferClassroomDialogProps {
  stageId: string | null;
  stageName: string;
  currentOrgId: string | null;
  onClose: () => void;
  onTransferred: (stageId: string) => void;
}

const FIELD_CLASS = 'w-full rounded-md border bg-background px-3 py-2 text-sm';

/** Affectation d'une formation à une autre organisation (super-administrateur). */
export function TransferClassroomDialog({
  stageId,
  stageName,
  currentOrgId,
  onClose,
  onTransferred,
}: TransferClassroomDialogProps) {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [toOrgId, setToOrgId] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!stageId) return;
    let cancelled = false;
    setToOrgId('');
    setNewOwnerId('');
    setOwners([]);
    fetch('/api/admin/tenants?limit=50&status=active')
      .then((response) => response.json() as Promise<{ tenants?: TenantOption[] }>)
      .then((payload) => {
        if (!cancelled) setTenants(payload.tenants ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('admin.transfer.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [stageId, t]);

  useEffect(() => {
    if (!toOrgId) return;
    let cancelled = false;
    setNewOwnerId('');
    fetch(`/api/admin/tenants/${encodeURIComponent(toOrgId)}/eligible-owners`)
      .then((response) => response.json() as Promise<{ owners?: OwnerOption[] }>)
      .then((payload) => {
        if (cancelled) return;
        const list = payload.owners ?? [];
        setOwners(list);
        if (list.length === 1) setNewOwnerId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('admin.transfer.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [toOrgId, t]);

  const submit = async () => {
    if (!stageId || !toOrgId || !newOwnerId || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/classrooms/${encodeURIComponent(stageId)}/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toOrgId, newOwnerId }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success(t('admin.transfer.done'));
      onTransferred(stageId);
    } catch {
      toast.error(t('admin.transfer.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={stageId !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent data-testid="transfer-classroom-dialog">
        <DialogHeader>
          <DialogTitle>{t('admin.transfer.title')}</DialogTitle>
          <DialogDescription>{stageName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <label className="block space-y-1">
            <span>{t('admin.transfer.organization')}</span>
            <select
              className={FIELD_CLASS}
              value={toOrgId}
              onChange={(event) => setToOrgId(event.target.value)}
              data-testid="transfer-organization"
            >
              <option value="">{t('admin.transfer.chooseOrganization')}</option>
              {tenants
                .filter((tenant) => tenant.id !== currentOrgId)
                .map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>{t('admin.transfer.owner')}</span>
            <select
              className={FIELD_CLASS}
              value={newOwnerId}
              onChange={(event) => setNewOwnerId(event.target.value)}
              disabled={!toOrgId || owners.length === 0}
              data-testid="transfer-owner"
            >
              <option value="">
                {toOrgId && owners.length === 0
                  ? t('admin.transfer.noEligibleOwner')
                  : t('admin.transfer.chooseOwner')}
              </option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.email ?? owner.id} ({owner.role})
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted-foreground">{t('admin.transfer.consequences')}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!toOrgId || !newOwnerId || submitting}
            data-testid="transfer-confirm"
          >
            {submitting ? t('admin.transfer.transferring') : t('admin.transfer.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
