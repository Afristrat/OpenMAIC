'use client';

import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useState, useEffect } from 'react';
import { NavigationSidebar } from './navigation-sidebar';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_KEY = 'qalem-sidebar-collapsed';

/** Pages where the sidebar should be completely hidden */
const HIDDEN_SIDEBAR_PATTERNS = [
  /^\/$/,
  /^\/classroom\//,
  /^\/generation-preview/,
  /^\/verify\//,
  /^\/auth$/,
];

export function SidebarLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const { locale } = useI18n();
  const isRtl = locale === 'ar-MA';

  const [collapsed, setCollapsed] = useState(false);

  // Sync collapsed state (reads the same localStorage key as the sidebar)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {
      // localStorage unavailable
    }

    // Listen for storage changes (same-tab sync via custom event)
    const handler = () => {
      try {
        setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handler);

    // Poll briefly to catch same-tab changes (localStorage events only fire cross-tab)
    const interval = setInterval(handler, 500);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hideSidebar = HIDDEN_SIDEBAR_PATTERNS.some((pattern) => pattern.test(pathname));

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <>
      <NavigationSidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          // Desktop offset
          isRtl ? (collapsed ? 'lg:mr-16' : 'lg:mr-60') : collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        {children}
      </main>
    </>
  );
}
