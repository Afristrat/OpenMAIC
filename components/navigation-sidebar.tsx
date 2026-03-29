'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  BookOpen,
  Brain,
  Store,
  User,
  Building2,
  Library,
  Map,
  BarChart3,
  Shield,
  KeyRound,
  Settings,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useIsSuperAdmin } from '@/lib/hooks/use-super-admin';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_KEY = 'qalem-sidebar-collapsed';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  show: boolean;
};

export function NavigationSidebar(): React.ReactElement {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, isGuest, signOut } = useAuth();
  const { currentOrg } = useOrganizations();
  const { isSuperAdmin } = useIsSuperAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isRtl = locale === 'ar-MA';

  // Hydrate collapsed state from localStorage
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const orgId = currentOrg?.id;
  const isAuthenticated = !!user && !isGuest;

  // --- Navigation items ---
  const mainItems: NavItem[] = [
    { href: '/', labelKey: 'nav.home', icon: <Home className="size-5" />, show: true },
    { href: '/review', labelKey: 'nav.review', icon: <Brain className="size-5" />, show: true },
    {
      href: '/marketplace/agents',
      labelKey: 'nav.marketplace',
      icon: <Store className="size-5" />,
      show: true,
    },
  ];

  const orgItems: NavItem[] = orgId
    ? [
        {
          href: `/org/${orgId}/admin`,
          labelKey: 'nav.organization',
          icon: <Building2 className="size-5" />,
          show: isAuthenticated,
        },
        {
          href: `/org/${orgId}/library`,
          labelKey: 'nav.library',
          icon: <Library className="size-5" />,
          show: isAuthenticated,
        },
        {
          href: `/org/${orgId}/curriculum`,
          labelKey: 'nav.curriculum',
          icon: <Map className="size-5" />,
          show: isAuthenticated,
        },
        {
          href: `/org/${orgId}/reports`,
          labelKey: 'nav.reports',
          icon: <BarChart3 className="size-5" />,
          show: isAuthenticated,
        },
      ]
    : [];

  const adminItems: NavItem[] = [
    {
      href: '/settings?tab=providers',
      labelKey: 'nav.admin',
      icon: <Shield className="size-5" />,
      show: isSuperAdmin,
    },
    {
      href: '/settings?tab=providers',
      labelKey: 'nav.apiKeys',
      icon: <KeyRound className="size-5" />,
      show: isSuperAdmin,
    },
  ];

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href.split('?')[0]);
  };

  const themeIcon =
    theme === 'dark' ? (
      <Moon className="size-4" />
    ) : theme === 'light' ? (
      <Sun className="size-4" />
    ) : (
      <Monitor className="size-4" />
    );

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const localeLabel = { 'fr-FR': 'FR', 'ar-MA': 'AR', 'en-US': 'EN', 'zh-CN': 'CN' }[locale];
  const cycleLocale = () => {
    const locales = ['fr-FR', 'ar-MA', 'en-US'] as const;
    const idx = locales.indexOf(locale as (typeof locales)[number]);
    const next = locales[(idx + 1) % locales.length];
    setLocale(next);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  // Render a single nav link
  const renderNavItem = (item: NavItem): React.ReactElement | null => {
    if (!item.show) return null;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href + item.labelKey}
        href={item.href}
        title={collapsed ? t(item.labelKey) : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary dark:bg-primary/20'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          collapsed && 'justify-center px-2',
        )}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
      </Link>
    );
  };

  const sidebarContent = (
    <div className={cn('flex flex-col h-full', isRtl && 'text-right')}>
      {/* Logo + collapse */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-border/40">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-horizontal.png" alt="Qalem" className="h-7" />
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="mx-auto">
            <img src="/logo-horizontal.png" alt="Qalem" className="h-6 w-auto" />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={t('nav.collapse')}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {mainItems.map(renderNavItem)}

        {/* Org section */}
        {orgItems.filter((i) => i.show).length > 0 && (
          <>
            <div className="my-3 mx-2 h-px bg-border/40" />
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/50">
                {t('nav.organization')}
              </p>
            )}
            {orgItems.map(renderNavItem)}
          </>
        )}

        {/* Admin section */}
        {adminItems.filter((i) => i.show).length > 0 && (
          <>
            <div className="my-3 mx-2 h-px bg-border/40" />
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/50">
                {t('nav.admin')}
              </p>
            )}
            {adminItems.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border/40 px-2 py-3 space-y-1">
        {/* Profile link for authenticated users */}
        {isAuthenticated && (
          <Link
            href="/profile"
            title={collapsed ? t('nav.profile') : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === '/profile'
                ? 'bg-primary/10 text-primary dark:bg-primary/20'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            <User className="size-5 shrink-0" />
            {!collapsed && <span className="truncate">{t('nav.profile')}</span>}
          </Link>
        )}

        {/* Settings */}
        <Link
          href="/settings"
          title={collapsed ? t('nav.settings') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-primary/10 text-primary dark:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-2',
          )}
        >
          <Settings className="size-5 shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.settings')}</span>}
        </Link>

        {/* Theme + Language row */}
        <div className={cn('flex items-center gap-1 px-1', collapsed ? 'flex-col' : 'flex-row')}>
          <button
            onClick={cycleTheme}
            className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={theme}
          >
            {themeIcon}
          </button>
          <button
            onClick={cycleLocale}
            className="flex items-center justify-center h-8 px-2 rounded-md text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {localeLabel}
          </button>
        </div>

        {/* Auth button */}
        {isAuthenticated ? (
          <button
            onClick={handleSignOut}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium w-full transition-colors',
              'text-destructive/80 hover:bg-destructive/10 hover:text-destructive',
              collapsed && 'justify-center px-2',
            )}
          >
            <LogOut className="size-5 shrink-0" />
            {!collapsed && <span className="truncate">{t('nav.logout')}</span>}
          </button>
        ) : (
          <Link
            href="/auth"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'text-primary hover:bg-primary/10',
              collapsed && 'justify-center px-2',
            )}
          >
            <LogIn className="size-5 shrink-0" />
            {!collapsed && <span className="truncate">{t('nav.login')}</span>}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-border/40 shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed top-0 z-50 h-full w-[260px] bg-background border-border/60 shadow-xl transition-transform duration-300 lg:hidden',
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          mobileOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full',
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className={cn(
            'absolute top-4 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            isRtl ? 'left-3' : 'right-3',
          )}
        >
          <X className="size-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-0 h-full bg-background border-border/60 transition-all duration-300 z-30',
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
