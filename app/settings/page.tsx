'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsDialog } from '@/components/settings';

/**
 * The dedicated route must expose the same complete provider registry as the
 * generation dialog. Keeping a second, reduced settings implementation made
 * image/video providers invisible and let both surfaces drift apart.
 */
export default function SettingsPage(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <SettingsDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) router.push('/app');
      }}
    />
  );
}
