'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tocItems = [
  { label: 'Politique de Confidentialit\u00e9', href: '/legal/privacy' },
  { label: "Conditions G\u00e9n\u00e9rales d'Utilisation", href: '/legal/terms' },
];

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0b1326] text-slate-200">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0b1326]/80 backdrop-blur-md border-b border-slate-700/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-[#d5baff] transition-colors font-[family-name:var(--font-display)] font-bold"
          >
            <ArrowLeft className="size-4" />
            Retour
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-xl font-black text-[#d5baff] tracking-tighter font-[family-name:var(--font-display)]">
            Qalem
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-12">
        {/* Sidebar TOC (desktop) */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6">
              Documents l&eacute;gaux
            </h3>
            <nav className="flex flex-col gap-2">
              {tocItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'text-sm px-4 py-2.5 rounded-lg transition-all duration-200',
                    pathname === item.href
                      ? 'bg-[#722ed1]/10 text-[#d5baff] font-semibold border border-[#722ed1]/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile TOC */}
        <div className="lg:hidden flex gap-2 mb-4">
          {tocItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full transition-colors',
                pathname === item.href
                  ? 'bg-[#722ed1]/20 text-[#d5baff] font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 max-w-4xl">{children}</main>
      </div>
    </div>
  );
}
