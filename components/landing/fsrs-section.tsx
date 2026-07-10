'use client';

import { Brain, Clock, Bell, RotateCcw, TrendingUp, Check, Zap } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export function FSRSSection(): React.ReactElement {
  const { t } = useI18n();

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      {/* Section Header */}
      <header className="text-center mb-20 max-w-3xl mx-auto">
        <span className="text-primary font-bold tracking-[0.1em] text-sm uppercase block mb-4">
          {t('landing.fsrs.eyebrow')}
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-extrabold text-foreground tracking-tight mb-6">
          {t('landing.fsrs.title')}
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {t('landing.fsrs.subtitle')}
        </p>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left: Forgetting Curve Graph */}
        <div className="lg:col-span-7 bg-secondary p-8 rounded-xl relative">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-[family-name:var(--font-display)] font-bold text-xl text-foreground">
              Courbe de l&apos;oubli
            </h3>
            <div className="flex gap-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-destructive border-dashed border-t-2" /> Sans
                r&eacute;vision
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-emerald-500" /> Avec FSRS
              </span>
            </div>
          </div>

          {/* SVG Graph */}
          <div className="relative w-full h-80">
            <div className="absolute -left-10 h-full flex flex-col justify-between text-[10px] text-muted-foreground font-bold">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>

            <svg className="w-full h-full overflow-visible" viewBox="0 0 550 300">
              {/* Grid Lines */}
              {[0, 75, 150, 225, 300].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="550"
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-border/30"
                />
              ))}
              {/* Red Dotted Curve (Standard Forgetting) */}
              <path
                d="M 0 30 Q 150 250 550 270"
                fill="none"
                stroke="#ba1a1a"
                strokeDasharray="6,4"
                strokeWidth="2"
                className="dark:stroke-[#ffb4ab]"
              />
              {/* Green Solid Curve (FSRS) */}
              <path
                d="M 0 30 L 100 45 L 102 30 L 220 50 L 222 30 L 400 60 L 402 30 L 550 40"
                fill="none"
                stroke="#006c4a"
                strokeWidth="3"
                className="dark:stroke-emerald-400"
              />
              {/* Review Points */}
              {[101, 221, 401].map((cx) => (
                <circle
                  key={cx}
                  cx={cx}
                  cy="30"
                  r="5"
                  fill="#006c4a"
                  className="dark:fill-emerald-400"
                />
              ))}
            </svg>

            {/* Stat Overlay Badge */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card shadow-xl rounded-full px-6 py-4 flex flex-col items-center border border-primary/10">
              <span className="text-3xl font-black text-primary leading-none">90% vs 30%</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mt-1">
                &Eacute;cart de r&eacute;tention
              </span>
            </div>

            {/* X Axis */}
            <div className="absolute -bottom-6 w-full flex justify-between text-[10px] text-muted-foreground font-bold">
              <span>Jour 0</span>
              <span>Jour 7</span>
              <span>Jour 15</span>
              <span>Jour 22</span>
              <span>Jour 30</span>
            </div>
          </div>
        </div>

        {/* Right: Phone Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-72 h-[580px] bg-[#0f172a] rounded-[3rem] p-3 shadow-2xl relative border-[6px] border-[#1e293b]">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#0f172a] rounded-b-xl z-10" />
            {/* Phone Content */}
            <div className="bg-card h-full w-full rounded-[2.2rem] overflow-hidden flex flex-col">
              {/* App Header */}
              <div className="pt-10 px-6 pb-4">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-muted-foreground text-lg">&times;</span>
                  <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="bg-primary h-full w-1/4" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">3/12</span>
                </div>
              </div>

              {/* Card Question */}
              <div className="flex-1 px-6 flex flex-col items-center justify-center text-center">
                <div className="bg-muted w-full aspect-square rounded-2xl flex items-center justify-center p-6 shadow-inner">
                  <h4 className="text-lg font-bold text-foreground leading-tight">
                    Quelle est la diff&eacute;rence entre FOB et CIF ?
                  </h4>
                </div>
                <button className="mt-8 text-primary font-bold text-sm border-b-2 border-primary/20 pb-1">
                  Voir la r&eacute;ponse
                </button>
              </div>

              {/* Rating Buttons */}
              <div className="p-4 grid grid-cols-4 gap-2 mb-4">
                {[
                  { icon: RotateCcw, label: 'Encore', color: 'text-destructive bg-destructive/10' },
                  {
                    icon: TrendingUp,
                    label: 'Difficile',
                    color: 'text-orange-500 bg-orange-500/10',
                  },
                  { icon: Check, label: 'Bien', color: 'text-emerald-500 bg-emerald-500/10' },
                  { icon: Zap, label: 'Facile', color: 'text-blue-500 bg-blue-500/10' },
                ].map((btn) => {
                  const Icon = btn.icon;
                  return (
                    <div key={btn.label} className="flex flex-col items-center gap-1">
                      <button
                        className={`w-full h-10 ${btn.color} rounded-lg flex items-center justify-center`}
                      >
                        <Icon className="size-4" />
                      </button>
                      <span className={`text-[9px] font-bold uppercase ${btn.color.split(' ')[0]}`}>
                        {btn.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* WhatsApp Notification */}
          <div className="mt-8 w-full max-w-xs">
            <div className="bg-[#25D366] text-white p-4 rounded-2xl shadow-lg flex items-center gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Brain className="size-5" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold">Qalem</span>
                  <span className="text-[10px] opacity-80">Maintenant</span>
                </div>
                <p className="text-sm font-medium">5 cartes &agrave; r&eacute;viser (2 min)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            icon: Brain,
            title: 'FSRS-5',
            desc: "L'algorithme d'Anki, directement int\u00e9gr\u00e9 pour une pr\u00e9cision chirurgicale.",
            iconColor: 'text-primary bg-primary/10',
          },
          {
            icon: Clock,
            title: '3 min/jour',
            desc: "Une session rapide entre deux caf\u00e9s. C'est tout ce qu'il faut pour ancrer le savoir.",
            iconColor: 'text-emerald-400 bg-emerald-400/10',
          },
          {
            icon: Bell,
            title: 'Omnicanal',
            desc: 'Push, Email ou WhatsApp. On vous rappelle discr\u00e8tement quand il est temps.',
            iconColor: 'text-amber-400 bg-amber-400/10',
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-card p-8 rounded-2xl flex flex-col items-center text-center group hover:bg-secondary transition-all duration-300"
            >
              <div
                className={`w-16 h-16 rounded-full ${stat.iconColor} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}
              >
                <Icon className="size-8" />
              </div>
              <h4 className="font-[family-name:var(--font-display)] font-bold text-xl mb-2 text-foreground">
                {stat.title}
              </h4>
              <p className="text-muted-foreground text-sm">{stat.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
