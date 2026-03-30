'use client';

import Link from 'next/link';
import { Github, Users, Briefcase, Megaphone, ExternalLink } from 'lucide-react';

export function Footer(): React.ReactElement {
  return (
    <footer className="bg-[#0b1326] relative pt-24 pb-12 overflow-hidden">
      {/* Subtle Ambient Glow Line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-[#722ed1]/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        {/* Column 1: Brand & Identity */}
        <div className="space-y-8">
          <div className="flex flex-col gap-4">
            <span className="text-3xl font-black text-[#d5baff] tracking-tighter font-[family-name:var(--font-display)]">
              Qalem
            </span>
            <p className="text-sm text-slate-400 leading-relaxed max-w-[240px]">
              Classe interactive IA — Open Source. Red&eacute;finir la transmission du savoir
              &agrave; l&apos;&egrave;re num&eacute;rique.
            </p>
          </div>

          {/* Social Icons */}
          <div className="flex items-center gap-4">
            {[
              { icon: Github, label: 'GitHub' },
              { icon: Users, label: 'Community' },
              { icon: Briefcase, label: 'LinkedIn' },
              { icon: Megaphone, label: 'Twitter' },
            ].map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href="#"
                  className="w-10 h-10 rounded-lg bg-[#171f33] flex items-center justify-center text-slate-400 hover:text-[#d5baff] hover:bg-[#222a3d] transition-all duration-300"
                  title={social.label}
                >
                  <Icon className="size-5" />
                </a>
              );
            })}
          </div>

          {/* Language Selector Pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#7f4f00] text-[#ffc784] border border-amber-400/20">
              FR
            </button>
            <button className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#2d3449] text-[#cdc3d7] hover:bg-[#222a3d] transition-colors">
              &#1593;&#1585;&#1576;&#1610;
            </button>
            <button className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#2d3449] text-[#cdc3d7] hover:bg-[#222a3d] transition-colors">
              EN
            </button>
          </div>
        </div>

        {/* Column 2: Produit */}
        <div className="flex flex-col gap-6">
          <h4 className="text-lg font-bold font-[family-name:var(--font-display)] tracking-tight text-[#d5baff]">
            Produit
          </h4>
          <nav className="flex flex-col gap-4">
            <Link
              href="#features"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Fonctionnalit&eacute;s
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Pricing
            </Link>
            <Link
              href="/app"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300 flex items-center gap-2"
            >
              D&eacute;mo Live
              <span className="px-1.5 py-0.5 rounded bg-[#722ed1]/10 text-[10px] text-[#d5baff] font-bold uppercase tracking-widest">
                Alpha
              </span>
            </Link>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Guide d&apos;Installation
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Documentation API
            </a>
          </nav>
        </div>

        {/* Column 3: Institutions */}
        <div className="flex flex-col gap-6">
          <h4 className="text-lg font-bold font-[family-name:var(--font-display)] tracking-tight text-[#d5baff]">
            Institutions
          </h4>
          <nav className="flex flex-col gap-4">
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Int&eacute;gration LMS
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Organisations
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Reporting
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Contacter l&apos;&Eacute;quipe
            </a>
            <a
              href="#"
              className="text-sm text-amber-400 hover:text-[#d5baff] transition-colors duration-300 font-semibold"
            >
              Pilote Gratuit
            </a>
          </nav>
        </div>

        {/* Column 4: Ressources */}
        <div className="flex flex-col gap-6">
          <h4 className="text-lg font-bold font-[family-name:var(--font-display)] tracking-tight text-[#d5baff]">
            Ressources
          </h4>
          <nav className="flex flex-col gap-4">
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300 flex items-center gap-2"
            >
              GitHub (Open Source)
              <ExternalLink className="size-3" />
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Guide du Formateur
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Guide de l&apos;Apprenant
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              Blog
            </a>
            <a
              href="#"
              className="text-sm text-slate-400 hover:text-[#d5baff] transition-colors duration-300"
            >
              FAQ
            </a>
          </nav>
        </div>
      </div>

      {/* Bottom Bar Section */}
      <div className="border-t border-[#4b4454]/15">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Left: Copyright */}
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-slate-500">
            <span>&copy; 2026 Qalem. Licence AGPL-3.0</span>
            <span className="hidden md:block w-1 h-1 rounded-full bg-[#4b4454]" />
            <span className="text-[#d5baff]/70">Crafted for the Digital Madrasa</span>
          </div>

          {/* Center: Geo-context */}
          <div className="text-xs font-bold font-[family-name:var(--font-display)] tracking-wide text-slate-400 bg-[#131b2e] px-4 py-2 rounded-full border border-[#4b4454]/10">
            Con&ccedil;u pour le Maroc et l&apos;Afrique
          </div>

          {/* Right: Legal Links */}
          <nav className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#" className="hover:text-[#d5baff] transition-colors">
              Politique de confidentialit&eacute;
            </a>
            <a href="#" className="hover:text-[#d5baff] transition-colors">
              Conditions d&apos;utilisation
            </a>
            <a
              href="#"
              className="hover:text-[#d5baff] transition-colors uppercase tracking-widest font-bold"
            >
              CNDP
            </a>
          </nav>
        </div>
      </div>

      {/* Decorative Element */}
      <div className="absolute bottom-0 right-0 opacity-5 pointer-events-none select-none overflow-hidden">
        <span className="text-[320px] font-black font-[family-name:var(--font-display)] tracking-tighter -mb-24 leading-none select-none text-foreground">
          QALEM
        </span>
      </div>
    </footer>
  );
}
