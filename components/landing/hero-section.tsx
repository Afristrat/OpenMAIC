'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';

export function HeroSection(): React.ReactElement {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden hero-gradient">
        {/* Abstract background grid */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-8 w-full grid md:grid-cols-12 gap-12 items-center py-20">
          {/* Left Side Content */}
          <div className="md:col-span-7 space-y-8">
            {/* Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold tracking-wide backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#82f5c1]" />
              Open Source &bull; AGPL-3.0
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white font-[family-name:var(--font-display)] leading-[1.1] tracking-tight">
              Cr&eacute;ez un cours complet en{' '}
              <span className="text-emerald-300">5 minutes</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-white/80 max-w-2xl leading-relaxed">
              Qalem transforme n&apos;importe quel sujet en classe interactive avec des
              professeurs et camarades IA — en fran&ccedil;ais, arabe ou anglais.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-5 pt-4">
              <Link
                href="/app"
                className="bg-white text-[#722ed1] px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
              >
                Essayer la D&eacute;mo
              </Link>
              <button className="flex items-center gap-2 text-white font-semibold group hover:bg-white/10 px-6 py-4 rounded-lg transition-all">
                <Play className="size-6 text-white" />
                Voir en action
              </button>
            </div>

            {/* Social Proof */}
            <div className="flex items-center gap-4 pt-8">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full border-2 border-[#722ed1] ring-2 ring-[#722ed1]/20 bg-[#dec8ff] flex items-center justify-center text-[#722ed1] text-xs font-bold"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
                <div className="w-10 h-10 rounded-full border-2 border-[#722ed1] bg-[#dec8ff] text-[#722ed1] flex items-center justify-center text-xs font-bold">
                  +50
                </div>
              </div>
              <p className="text-white/70 text-sm font-medium">
                Utilis&eacute; par 50+ formateurs au Maroc
              </p>
            </div>
          </div>

          {/* Right Side Visual — Interface Mockup */}
          <div className="md:col-span-5 relative group">
            {/* Floating Glow */}
            <div className="absolute -inset-10 bg-[#722ed1]/30 blur-[100px] rounded-full pointer-events-none group-hover:bg-[#722ed1]/40 transition-all duration-700" />

            <div className="relative transform rotate-2 hover:rotate-0 transition-all duration-700">
              <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden shadow-2xl p-4">
                {/* Browser toolbar */}
                <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                  <div className="w-3 h-3 rounded-full bg-red-400/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/50" />
                  <div className="w-3 h-3 rounded-full bg-green-400/50" />
                  <div className="ml-4 flex-1 h-6 bg-white/10 rounded px-3 flex items-center">
                    <span className="text-[10px] text-white/40">qalem.ai/classroom/biology-101</span>
                  </div>
                </div>

                {/* Slide preview area */}
                <div className="relative rounded-lg overflow-hidden aspect-video mb-4 bg-gradient-to-br from-[#722ed1]/20 to-[#4f46e5]/20">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="w-20 h-20 mx-auto rounded-full bg-white/10 flex items-center justify-center">
                        <Play className="size-8 text-white/80" />
                      </div>
                      <p className="text-white/60 text-xs">Biologie Cellulaire</p>
                    </div>
                  </div>
                  <div className="absolute top-3 left-3 px-2 py-1 bg-[#722ed1] rounded-md text-[10px] text-white flex items-center gap-1">
                    Professeur IA: Dr. Karim
                  </div>
                </div>

                {/* Roundtable Avatars */}
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {['Yassin', 'Laila', 'Omar', 'Sarah AI', 'Mehdi', 'Adam AI'].map(
                    (name, i) => (
                      <div key={name} className="space-y-1 text-center">
                        <div
                          className={`w-full aspect-square rounded-full border p-0.5 relative ${
                            i === 3 || i === 5 ? 'border-emerald-400' : 'border-white/10'
                          }`}
                        >
                          <div className="w-full h-full rounded-full bg-white/10 flex items-center justify-center text-[8px] text-white/60 font-bold">
                            {name[0]}
                          </div>
                          {(i === 3 || i === 5) && (
                            <div className="absolute -top-1 -right-1 bg-emerald-400 text-[6px] px-1 rounded-full text-white">
                              AI
                            </div>
                          )}
                        </div>
                        <span className="text-[8px] text-white/60">{name}</span>
                      </div>
                    ),
                  )}
                </div>

                {/* Floating Chat */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="w-5 h-5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <div className="bg-white/10 rounded-lg p-2 text-[10px] text-white/90 max-w-[80%]">
                      Est-ce que l&apos;ARN messager joue un r&ocirc;le ici ?
                    </div>
                  </div>
                  <div className="flex flex-row-reverse gap-2 items-start">
                    <div className="w-5 h-5 rounded-full bg-[#722ed1] flex-shrink-0" />
                    <div className="qalam-spark rounded-lg p-2 text-[10px] text-white/90 max-w-[80%]">
                      Excellent point, Sarah ! Exactement. L&apos;ARNm transmet l&apos;info du
                      noyau...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter Bar */}
      <section className="bg-background py-12 -mt-10 relative z-20">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: '15 jours \u2192 5 minutes',
                label: 'Temps de cr\u00e9ation',
                icon: '\u23F3',
              },
              { title: '9 voix naturelles', label: 'Providers TTS', icon: '\uD83C\uDFA4' },
              { title: '3 langues', label: 'FR \u2022 AR \u2022 EN', icon: '\uD83C\uDF10' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card p-6 rounded-xl shadow-lg shadow-[#722ed1]/5 flex items-center gap-5 border border-[#722ed1]/5 hover:border-[#722ed1]/20 transition-all group"
              >
                <div className="w-14 h-14 rounded-full bg-[#722ed1]/5 flex items-center justify-center text-2xl group-hover:bg-[#722ed1] group-hover:text-white transition-all">
                  {stat.icon}
                </div>
                <div>
                  <h4 className="text-2xl font-bold font-[family-name:var(--font-display)] text-foreground">
                    {stat.title}
                  </h4>
                  <p className="text-sm text-muted-foreground uppercase tracking-widest">
                    {stat.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
