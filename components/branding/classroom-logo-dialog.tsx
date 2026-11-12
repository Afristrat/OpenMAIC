'use client';

import { useRef, useState } from 'react';
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

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Lets an editor give one classroom its own logo (for example the client's),
 * shown instead of the organisation logo on its slides and exports. The server
 * route re-checks the editing right, the format and the size.
 */
export function ClassroomLogoDialog({
  classroomId,
  open,
  onOpenChange,
}: {
  classroomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // `version` busts the browser cache after a change; `hasLogo` follows the preview load.
  const [version, setVersion] = useState(() => Date.now());
  const [hasLogo, setHasLogo] = useState(true);
  const endpoint = `/api/classroom/${encodeURIComponent(classroomId)}/logo`;

  const upload = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_LOGO_BYTES) {
      toast.error(t('classroom.logo.invalid'));
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('logo', file);
      const response = await fetch(endpoint, { method: 'POST', body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHasLogo(true);
      setVersion(Date.now());
      toast.success(t('classroom.logo.uploaded'));
    } catch {
      toast.error(t('classroom.logo.failed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHasLogo(false);
      setVersion(Date.now());
      toast.success(t('classroom.logo.removed'));
    } catch {
      toast.error(t('classroom.logo.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('classroom.logo.title')}</DialogTitle>
          <DialogDescription>{t('classroom.logo.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-24 items-center justify-center rounded-xl bg-slate-100 p-4 dark:bg-slate-800/80">
          {hasLogo ? (
            <img
              key={version}
              src={`${endpoint}?v=${version}`}
              alt={t('classroom.logo.preview')}
              className="max-h-20 max-w-full object-contain"
              onError={() => setHasLogo(false)}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">{t('classroom.logo.none')}</p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={busy || !hasLogo} onClick={() => void remove()}>
            {t('classroom.logo.remove')}
          </Button>
          <Button disabled={busy} onClick={() => inputRef.current?.click()}>
            {t('classroom.logo.choose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
