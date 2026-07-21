'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Check,
  FileSearch,
  FileText,
  Globe2,
  Layers3,
  Menu,
  MessageCircleMore,
  Mic2,
  PencilLine,
  Play,
  Settings2,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { PERSONA_CATALOG } from '@/lib/agents/persona-catalog';
import { qalemUiLocales } from '@/lib/i18n';
import { useI18n } from '@/lib/hooks/use-i18n';
import { commercialCopy, type CommercialLocale } from './commercial-copy';

const propositionSubject: Record<CommercialLocale, string> = {
  'fr-FR': 'Proposition commerciale Qalem',
  'en-US': 'Qalem commercial proposal',
  'ar-MA': 'عرض تجاري من قلم',
};

const demonstrationSubject: Record<CommercialLocale, string> = {
  'fr-FR': 'Démonstration guidée Qalem',
  'en-US': 'Qalem guided demonstration',
  'ar-MA': 'عرض توضيحي لمنصة قلم',
};

function contactHref(subject: string): string {
  return `mailto:contact@qalem.ma?subject=${encodeURIComponent(subject)}`;
}

function Eyebrow({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <p
      className={`mb-5 flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.24em] ${dark ? 'text-[#8b2aa8]' : 'text-[#f0b4ff]'}`}
    >
      <span className={`h-px w-8 ${dark ? 'bg-[#8b2aa8]' : 'bg-[#f0b4ff]'}`} />
      {children}
    </p>
  );
}

function CommercialHeader({
  locale,
  setLocale,
}: {
  locale: CommercialLocale;
  setLocale: (locale: CommercialLocale) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const copy = commercialCopy[locale];
  const proposal = contactHref(propositionSubject[locale]);
  const links = [
    { href: '#experience', label: copy.nav.experience },
    { href: '#agents', label: copy.nav.agents },
    { href: '#institutions', label: copy.nav.institutions },
    { href: '#offers', label: copy.nav.offers },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#090817]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.75rem] max-w-[90rem] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="Qalem">
          <span className="font-[family-name:var(--font-display)] text-2xl font-black tracking-[-0.05em] text-white">
            Qalem
          </span>
          <span className="text-sm font-bold text-[#e8a7ff] transition-transform group-hover:-translate-y-0.5">
            قلم
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-white/65 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center border border-white/15 bg-white/[0.04] p-1">
            {qalemUiLocales.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLocale(item.code)}
                aria-label={item.label}
                aria-pressed={locale === item.code}
                className={`min-w-10 px-2 py-1.5 text-[11px] font-black tracking-[0.12em] transition-colors ${
                  locale === item.code
                    ? 'bg-white text-[#171024]'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
          <Link
            href="/auth"
            className="px-3 py-2 text-sm font-semibold text-white/70 hover:text-white"
          >
            {copy.nav.login}
          </Link>
          <a
            href={proposal}
            className="group flex items-center gap-2 bg-[#d756f2] px-5 py-3 text-sm font-extrabold text-[#17051d] transition-colors hover:bg-[#efa4ff]"
          >
            {copy.nav.proposal}
            <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-[-90deg]" />
          </a>
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center border border-white/15 text-white md:hidden"
          aria-label={copy.nav.menu}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#090817] px-5 py-6 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Navigation mobile">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 py-4 text-lg font-bold text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex border border-white/15 p-1">
              {qalemUiLocales.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setLocale(item.code)}
                  aria-label={item.label}
                  aria-pressed={locale === item.code}
                  className={`px-3 py-2 text-xs font-black ${locale === item.code ? 'bg-white text-[#171024]' : 'text-white/60'}`}
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>
            <Link href="/auth" className="text-sm font-bold text-white/75">
              {copy.nav.login}
            </Link>
          </div>
          <a
            href={proposal}
            className="mt-5 block bg-[#d756f2] px-5 py-4 text-center font-extrabold text-[#17051d]"
          >
            {copy.nav.proposal}
          </a>
        </div>
      )}
    </header>
  );
}

function Hero({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale];

  return (
    <section className="relative isolate overflow-hidden bg-[#090817] pb-20 pt-36 text-white sm:pb-28 sm:pt-44">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_80%_16%,rgba(203,74,233,0.22),transparent_30%),radial-gradient(circle_at_12%_70%,rgba(50,211,190,0.11),transparent_24%)]" />
      <div className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />

      <div className="mx-auto grid max-w-[90rem] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-12">
        <div className="max-w-3xl">
          <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
          <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-[clamp(3rem,7vw,6.75rem)] font-black leading-[0.92] tracking-[-0.065em] text-white">
            {copy.hero.title}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
            {copy.hero.body}
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href={contactHref(propositionSubject[locale])}
              className="group inline-flex items-center justify-center gap-3 bg-[#d756f2] px-7 py-4 font-extrabold text-[#17051d] transition-colors hover:bg-[#efa4ff]"
            >
              {copy.hero.primary}
              <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-[-90deg]" />
            </a>
            <a
              href="#experience"
              className="inline-flex items-center justify-center gap-3 border border-white/20 px-7 py-4 font-bold text-white transition-colors hover:border-white/50 hover:bg-white/[0.06]"
            >
              <Play className="size-4 fill-current" />
              {copy.hero.secondary}
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/62">
            {copy.hero.proof.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 text-[#52d9c4]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
          <div className="absolute -inset-6 border border-[#d756f2]/20" />
          <div className="relative border border-white/15 bg-[#101022] shadow-[0_30px_100px_rgba(0,0,0,.45)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-[#d756f2]" />
                <span className="size-2 bg-[#52d9c4]" />
                <span className="size-2 bg-white/20" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
                Qalem Studio
              </span>
            </div>

            <div className="grid gap-px bg-white/10 sm:grid-cols-[.78fr_1.22fr]">
              <div className="bg-[#0d0d1d] p-6">
                <div className="mb-7 flex items-center gap-3 text-[#eaa0fa]">
                  <FileSearch className="size-5" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                    {copy.hero.sourceLabel}
                  </span>
                </div>
                <p className="font-[family-name:var(--font-display)] text-xl font-extrabold leading-tight text-white">
                  {copy.hero.sourceTitle}
                </p>
                <div className="mt-7 space-y-3">
                  {[FileText, Globe2, Layers3].map((Icon, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 border-l-2 border-white/10 py-2 pl-3 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-3"
                    >
                      <Icon className="size-4 text-white/40" />
                      <span
                        className="h-1.5 rounded-full bg-white/15"
                        style={{ width: `${74 - index * 14}%` }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-7 text-xs leading-5 text-white/40">{copy.hero.sourceMeta}</p>
              </div>

              <div className="bg-[#141128] p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[#73e4d2]">
                    <Sparkles className="size-5" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                      {copy.hero.classLabel}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-white/30">01 / 09</span>
                </div>
                <p className="mt-6 max-w-sm font-[family-name:var(--font-display)] text-2xl font-black leading-tight text-white">
                  {copy.hero.classTitle}
                </p>

                <div className="mt-8 flex -space-x-2 rtl:space-x-reverse">
                  {PERSONA_CATALOG.map((persona) => (
                    <div
                      key={persona.id}
                      className="relative size-9 overflow-hidden rounded-full border-2 border-[#141128] bg-white/10"
                    >
                      <Image
                        src={persona.avatar}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-5 border-t border-white/10 pt-6">
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <Volume2 className="size-4 text-[#eaa0fa]" />
                    <div className="relative h-px bg-white/15">
                      <span className="absolute -top-1 left-[18%] size-2 bg-[#d756f2]" />
                      <span className="absolute -top-1 left-[54%] size-2 bg-[#d756f2]" />
                      <span className="absolute -top-1 left-[82%] size-2 bg-[#d756f2]" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/45">
                      {copy.hero.narration}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <MessageCircleMore className="size-4 text-[#73e4d2]" />
                    <div className="relative h-px bg-white/15">
                      <span className="absolute -top-1 left-[34%] size-2 bg-[#52d9c4]" />
                      <span className="absolute -top-1 left-[69%] size-2 bg-[#52d9c4]" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/45">
                      {copy.hero.interaction}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Experience({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].experience;

  return (
    <section id="experience" className="scroll-mt-24 bg-[#f4f0ea] py-24 text-[#1b1523] sm:py-32">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-8 border-b border-[#1b1523]/15 pb-14 lg:grid-cols-[.8fr_1.2fr]">
          <Eyebrow dark>{copy.eyebrow}</Eyebrow>
          <div>
            <h2 className="max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
              {copy.title}
            </h2>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-[#51485a]">{copy.body}</p>
          </div>
        </div>

        <ol className="grid lg:grid-cols-4">
          {copy.steps.map((step, index) => (
            <li
              key={step.number}
              className={`relative px-0 py-10 lg:min-h-[22rem] lg:px-7 lg:py-12 ${index > 0 ? 'border-t border-[#1b1523]/15 lg:border-l lg:border-t-0 rtl:lg:border-l-0 rtl:lg:border-r' : ''}`}
            >
              <span className="font-mono text-sm font-bold text-[#8b2aa8]">{step.number}</span>
              <h3 className="mt-16 font-[family-name:var(--font-display)] text-2xl font-black tracking-[-0.03em]">
                {step.title}
              </h3>
              <p className="mt-4 leading-7 text-[#665d6d]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Agents({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].agents;

  return (
    <section
      id="agents"
      className="scroll-mt-24 overflow-hidden bg-[#11101f] py-24 text-white sm:py-32"
    >
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="grid items-end gap-12 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <h2 className="max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black leading-[1] tracking-[-0.05em] sm:text-6xl">
              {copy.title}
            </h2>
          </div>
          <div>
            <p className="text-lg leading-8 text-white/65">{copy.body}</p>
            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm font-bold text-[#77dfce]">
              {copy.settings.map((setting) => (
                <li key={setting} className="flex items-center gap-2">
                  <Settings2 className="size-4" />
                  {setting}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {PERSONA_CATALOG.map((persona, index) => {
            const item = copy.roster[index];
            return (
              <article
                key={persona.id}
                className="group relative min-h-72 overflow-hidden bg-[#171527] p-6 transition-colors hover:bg-[#211b35]"
              >
                <span className="absolute right-5 top-4 font-mono text-xs text-white/20 rtl:left-5 rtl:right-auto">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="relative size-20 overflow-hidden rounded-full bg-white/8 ring-1 ring-white/10">
                  <Image
                    src={persona.avatar}
                    alt={persona.defaultName}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-[#d77cf0]">
                  {item.role}
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-black">
                  {persona.defaultName}
                </h3>
                <p className="mt-4 text-sm leading-6 text-white/55">{item.purpose}</p>
                <span className="absolute bottom-0 left-0 h-1 w-0 bg-[#52d9c4] transition-all duration-500 group-hover:w-full" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Studio({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].studio;

  return (
    <section className="bg-white py-24 text-[#1b1523] sm:py-32">
      <div className="mx-auto grid max-w-[90rem] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:px-12">
        <div>
          <Eyebrow dark>{copy.eyebrow}</Eyebrow>
          <h2 className="font-[family-name:var(--font-display)] text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
            {copy.title}
          </h2>
          <p className="mt-7 text-lg leading-8 text-[#61576a]">{copy.body}</p>
          <div className="mt-10 grid gap-7 sm:grid-cols-2">
            {copy.points.map((point, index) => (
              <div key={point.title}>
                <span className="font-mono text-xs font-black text-[#9a34b7]">0{index + 1}</span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-black">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#6e6575]">{point.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#22182b]/15 bg-[#eee9f0] p-3 shadow-[24px_24px_0_#21152b] sm:p-5">
          <div className="border border-[#22182b]/10 bg-white">
            <div className="flex items-center justify-between border-b border-[#22182b]/10 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-black">
                <PencilLine className="size-4 text-[#9a34b7]" />
                {copy.canvasLabel}
              </div>
              <span className="font-mono text-[10px] text-[#776b7d]">04 / 09</span>
            </div>
            <div className="grid min-h-[32rem] lg:grid-cols-[1.1fr_.9fr]">
              <div className="flex flex-col justify-between border-b border-[#22182b]/10 bg-[#171323] p-7 text-white lg:border-b-0 lg:border-r rtl:lg:border-l rtl:lg:border-r-0">
                <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#7be1d0]">
                  Cas pratique
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-4xl font-black leading-none">
                    {copy.slideTitle}
                  </h3>
                  <p className="mt-5 max-w-sm leading-7 text-white/65">{copy.slideBody}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[72, 48, 62].map((height, index) => (
                    <div key={height} className="flex h-20 items-end bg-white/[0.04] p-2">
                      <span
                        className="w-full bg-[#d756f2]"
                        style={{ height: `${height}%`, opacity: 1 - index * 0.2 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col bg-[#f8f5f1] p-6">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.17em] text-[#8b2aa8]">
                  <Mic2 className="size-4" />
                  {copy.notesLabel}
                </div>
                <div className="mt-5 flex-1 border border-[#22182b]/12 bg-white p-5 text-sm leading-7 text-[#584f60]">
                  {copy.notes}
                </div>
                <button
                  type="button"
                  className="mt-4 flex items-center justify-center gap-2 bg-[#21152b] px-5 py-3 text-sm font-extrabold text-white"
                >
                  <Volume2 className="size-4" />
                  {copy.regenerate}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Institutions({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].institutions;

  return (
    <section id="institutions" className="scroll-mt-24 bg-[#d9f4ed] py-24 text-[#14231f] sm:py-32">
      <div className="mx-auto grid max-w-[90rem] gap-14 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:px-12">
        <div>
          <Eyebrow dark>{copy.eyebrow}</Eyebrow>
          <Building2 className="mt-12 size-24 stroke-[1] text-[#176f61]" />
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
            {copy.title}
          </h2>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#38584f]">{copy.body}</p>
          <ul className="mt-10 grid gap-px border border-[#176f61]/20 bg-[#176f61]/20 sm:grid-cols-2">
            {copy.points.map((point) => (
              <li
                key={point}
                className="flex min-h-32 items-start gap-4 bg-[#e8faf5] p-6 font-bold leading-6"
              >
                <Check className="mt-0.5 size-5 shrink-0 text-[#176f61]" />
                {point}
              </li>
            ))}
          </ul>
          <a
            href={contactHref(propositionSubject[locale])}
            className="group mt-8 inline-flex items-center gap-3 bg-[#163e35] px-7 py-4 font-extrabold text-white hover:bg-[#0d2e27]"
          >
            {copy.cta}
            <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-[-90deg]" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Offers({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].offers;
  const plans = [copy.studio, copy.institution];

  return (
    <section id="offers" className="scroll-mt-24 bg-[#f4f0ea] py-24 text-[#1b1523] sm:py-32">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="max-w-5xl">
          <Eyebrow dark>{copy.eyebrow}</Eyebrow>
          <h2 className="font-[family-name:var(--font-display)] text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
            {copy.title}
          </h2>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#61576a]">{copy.body}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {plans.map((plan, index) => (
            <article
              key={plan.name}
              className={`flex min-h-[35rem] flex-col border p-7 sm:p-10 ${index === 0 ? 'border-[#982eb5] bg-white' : 'border-[#21152b] bg-[#21152b] text-white'}`}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p
                    className={`text-xs font-black uppercase tracking-[0.2em] ${index === 0 ? 'text-[#8b2aa8]' : 'text-[#e7a2f7]'}`}
                  >
                    Qalem
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-black tracking-[-0.04em]">
                    {plan.name}
                  </h3>
                </div>
                {index === 0 ? (
                  <Sparkles className="size-9 text-[#8b2aa8]" />
                ) : (
                  <Building2 className="size-9 text-[#77dfce]" />
                )}
              </div>
              <p
                className={`mt-6 max-w-xl leading-7 ${index === 0 ? 'text-[#62576a]' : 'text-white/60'}`}
              >
                {plan.audience}
              </p>
              <p className="mt-10 font-[family-name:var(--font-display)] text-3xl font-black">
                {plan.price}
              </p>
              <ul
                className={`mt-8 space-y-4 border-t pt-8 ${index === 0 ? 'border-[#21152b]/12' : 'border-white/15'}`}
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 font-semibold">
                    <Check
                      className={`mt-0.5 size-5 shrink-0 ${index === 0 ? 'text-[#8b2aa8]' : 'text-[#77dfce]'}`}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={contactHref(
                  index === 0
                    ? propositionSubject[locale]
                    : `${propositionSubject[locale]} Institution`,
                )}
                className={`group mt-auto flex items-center justify-between px-6 py-4 font-extrabold ${index === 0 ? 'bg-[#d756f2] text-[#17051d]' : 'bg-[#77dfce] text-[#10231e]'}`}
              >
                {plan.cta}
                <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-[-90deg]" />
              </a>
            </article>
          ))}
        </div>
        <p className="mt-7 max-w-4xl text-sm leading-6 text-[#6d6374]">{copy.precision}</p>
      </div>
    </section>
  );
}

function Closing({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].closing;

  return (
    <section className="relative overflow-hidden bg-[#8e2aaa] py-24 text-white sm:py-32">
      <div className="absolute -right-24 -top-24 size-96 rounded-full border-[60px] border-white/[0.06] rtl:-left-24 rtl:right-auto" />
      <div className="relative mx-auto grid max-w-[90rem] items-end gap-12 px-5 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:px-12">
        <div>
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 className="max-w-5xl font-[family-name:var(--font-display)] text-4xl font-black leading-[1] tracking-[-0.05em] sm:text-6xl">
            {copy.title}
          </h2>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/75">{copy.body}</p>
        </div>
        <div className="flex flex-col gap-4">
          <a
            href={contactHref(propositionSubject[locale])}
            className="group flex items-center justify-between bg-white px-6 py-4 font-extrabold text-[#511360]"
          >
            {copy.primary}
            <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:rotate-[-90deg]" />
          </a>
          <a
            href={contactHref(demonstrationSubject[locale])}
            className="flex items-center justify-center gap-3 border border-white/40 px-6 py-4 font-extrabold text-white hover:bg-white/10"
          >
            <Play className="size-4 fill-current" />
            {copy.secondary}
          </a>
        </div>
      </div>
    </section>
  );
}

function CommercialFooter({ locale }: { locale: CommercialLocale }): React.ReactElement {
  const copy = commercialCopy[locale].footer;

  return (
    <footer className="bg-[#090817] py-16 text-white">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 border-b border-white/10 pb-14 lg:grid-cols-[1.4fr_.6fr_.6fr]">
          <div>
            <p className="font-[family-name:var(--font-display)] text-3xl font-black tracking-[-0.05em]">
              Qalem <span className="text-[#e49af5]">قلم</span>
            </p>
            <p className="mt-5 max-w-lg leading-7 text-white/55">{copy.promise}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
              {copy.product}
            </p>
            <div className="mt-5 flex flex-col gap-3 text-sm font-semibold text-white/70">
              <a href="#experience" className="hover:text-white">
                Studio
              </a>
              <a href="#agents" className="hover:text-white">
                Agents
              </a>
              <a href="#offers" className="hover:text-white">
                {commercialCopy[locale].nav.offers}
              </a>
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
              {copy.legal}
            </p>
            <div className="mt-5 flex flex-col gap-3 text-sm font-semibold text-white/70">
              <a href="mailto:contact@qalem.ma" className="hover:text-white">
                {copy.contact}
              </a>
              <Link href="/legal/privacy" className="hover:text-white">
                {copy.privacy}
              </Link>
              <Link href="/legal/terms" className="hover:text-white">
                {copy.terms}
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-7 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Qalem. {copy.rights}</p>
          <p>contact@qalem.ma</p>
        </div>
      </div>
    </footer>
  );
}

export function CommercialHome(): React.ReactElement {
  const { locale: activeLocale, setLocale } = useI18n();
  const locale: CommercialLocale = activeLocale === 'zh-CN' ? 'en-US' : activeLocale;

  return (
    <div
      data-testid="commercial-homepage"
      className="min-h-screen bg-[#090817] selection:bg-[#d756f2] selection:text-[#17051d]"
    >
      <CommercialHeader locale={locale} setLocale={setLocale} />
      <main>
        <Hero locale={locale} />
        <Experience locale={locale} />
        <Agents locale={locale} />
        <Studio locale={locale} />
        <Institutions locale={locale} />
        <Offers locale={locale} />
        <Closing locale={locale} />
      </main>
      <CommercialFooter locale={locale} />
    </div>
  );
}
