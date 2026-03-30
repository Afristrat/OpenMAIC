'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export function LandingNav(): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

  const navLinks = [
    { label: t('landing.nav.features'), href: '/#features' },
    { label: t('landing.nav.institutions'), href: '/#institutions' },
    { label: t('landing.nav.pricing'), href: '/#pricing' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-8 py-4">
        {/* Brand */}
        <Link
          href="/"
          className="text-2xl font-black tracking-tighter text-[#d5baff] font-[family-name:var(--font-display)]"
        >
          Qalem
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-400 hover:text-[#d5baff] transition-colors font-[family-name:var(--font-display)] tracking-tight font-bold text-sm"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center bg-[#131b2e] px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#d5baff]/70">
            FR | AR | EN
          </div>
          <Link
            href="/auth"
            className="hidden lg:block text-slate-400 hover:text-[#d5baff] font-[family-name:var(--font-display)] font-medium text-sm tracking-tight hover:bg-white/5 px-4 py-2 rounded-lg transition-all"
          >
            {t('landing.nav.login')}
          </Link>
          <Link
            href="/app"
            className="bg-[#722ed1] text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:scale-95 active:scale-90 transition-transform"
          >
            {t('landing.nav.tryFree')}
          </Link>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0b1326] border-t border-[#4b4454]/20 px-8 py-6 space-y-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block text-slate-300 hover:text-[#d5baff] font-[family-name:var(--font-display)] font-bold text-lg transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/auth"
            className="block text-[#d5baff] font-bold mt-4"
            onClick={() => setMobileOpen(false)}
          >
            {t('landing.nav.login')}
          </Link>
        </div>
      )}
    </nav>
  );
}
