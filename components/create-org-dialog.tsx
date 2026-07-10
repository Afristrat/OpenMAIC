'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SECTORS = [
  'healthcare',
  'legal',
  'tech',
  'finance',
  'education',
  'industry',
] as const;

type SectorValue = (typeof SECTORS)[number];

interface CreateOrgDialogProps {
  collapsed?: boolean;
}

export function CreateOrgDialog({ collapsed = false }: CreateOrgDialogProps): React.ReactElement {
  const { t } = useI18n();
  const { createOrganization } = useOrganizations();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState<SectorValue | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetForm = (): void => {
    setName('');
    setSector('');
    setError('');
    setIsSubmitting(false);
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) resetForm();
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    setError('');

    try {
      await createOrganization(trimmed, sector || null);
      toast.success(t('org.created'));
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={collapsed ? t('org.create') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-2',
          )}
        >
          <Plus className="size-5 shrink-0" />
          {!collapsed && <span className="truncate">{t('org.create')}</span>}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('org.create')}</DialogTitle>
          <DialogDescription>{t('org.noOrganizations')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="org-name" className="text-sm font-medium">
              {t('org.name')} <span className="text-destructive">*</span>
            </label>
            <input
              id="org-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Sector */}
          <div className="space-y-2">
            <label htmlFor="org-sector" className="text-sm font-medium">
              {t('org.sector')}
            </label>
            <select
              id="org-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value as SectorValue | '')}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">—</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {t(`org.sectors.${s}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? t('common.loading') : t('org.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
