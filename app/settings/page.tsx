'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsDialog } from '@/components/settings';

/**
 * User-level model and media preferences live here. Platform governance and
 * institutional integrations remain in /admin.
 */
export default function SettingsPage(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <SettingsDialog
      open={open}
      initialSection="providers"
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) router.push('/app');
      }}
    />
  );
}
