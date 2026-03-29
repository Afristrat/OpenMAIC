'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SettingsDialog } from '@/components/settings';
import type { SettingsSection } from '@/lib/types/settings';

/**
 * Dedicated settings page at /settings.
 * Renders the existing SettingsDialog as a full-screen overlay that is always open.
 * Supports ?tab= query parameter to jump to a specific section.
 */
export default function SettingsPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsSection | null;

  const [open, setOpen] = useState(true);

  // Keep the dialog open — if user closes it, redirect back
  useEffect(() => {
    if (!open) {
      window.history.back();
    }
  }, [open]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsDialog open={open} onOpenChange={setOpen} initialSection={tabParam ?? undefined} />
    </div>
  );
}
