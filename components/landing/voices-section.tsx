'use client';

import { Play } from 'lucide-react';

const voiceCards = [
  {
    lang: 'Fran\u00e7ais',
    name: 'Charlotte \u2014 ElevenLabs',
    desc: 'Voix professionnelle, claire et chaleureuse',
    badge: '9/10 Naturalit\u00e9',
    flag: 'FR',
    barColor: 'bg-[#d5baff]',
    badgeBg: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    hoverShadow: 'hover:shadow-[0_20px_50px_rgba(114,46,209,0.15)]',
    hoverBorder: 'hover:border-[#722ed1]/40',
  },
  {
    lang: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
    name: '\u063A\u0632\u0644\u0627\u0646 \u2014 Darija',
    desc: '\u0635\u0648\u062A \u0637\u0628\u064A\u0639\u064A \u0628\u0627\u0644\u062F\u0627\u0631\u062C\u0629 \u0627\u0644\u0645\u063A\u0631\u0628\u064A\u0629',
    badge: '\uD83C\uDDF2\uD83C\uDDE6 Darija',
    flag: 'AR',
    barColor: 'bg-emerald-400',
    badgeBg: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    hoverShadow: 'hover:shadow-[0_20px_50px_rgba(37,164,117,0.15)]',
    hoverBorder: 'hover:border-emerald-400/40',
    rtl: true,
  },
  {
    lang: 'English',
    name: 'James \u2014 Fish Audio S2',
    desc: 'Professional, warm, conversational',
    badge: '9/10 Naturalit\u00e9',
    flag: 'EN',
    barColor: 'bg-blue-400',
    badgeBg: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    hoverShadow: 'hover:shadow-[0_20px_50px_rgba(59,130,246,0.15)]',
    hoverBorder: 'hover:border-blue-400/30',
  },
];

export function VoicesSection(): React.ReactElement {
  return (
    <section className="py-24 overflow-hidden bg-background">
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <div className="text-center mb-20 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-[#722ed1]/30 bg-[#722ed1]/10 text-[#722ed1] dark:text-[#d5baff] text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(114,46,209,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#722ed1] animate-pulse" />
            VOTRE LANGUE, VOTRE VOIX
          </div>
          <h2 className="text-5xl md:text-6xl font-black font-[family-name:var(--font-display)] text-foreground tracking-tighter max-w-3xl mx-auto leading-tight">
            Pas de robot.{' '}
            <span className="text-primary purple-glow-text">De vraies voix.</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-medium">
            9 providers TTS avec des voix qui sonnent humaines — en fran&ccedil;ais, en arabe,
            et m&ecirc;me en{' '}
            <span className="text-amber-400">darija marocaine</span>.
          </p>
        </div>

        {/* Voice Demo Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 justify-items-center mb-24">
          {voiceCards.map((card) => (
            <div
              key={card.lang}
              className={`group relative w-full max-w-[360px] bg-card rounded-[20px] p-8 border border-border/15 ${card.hoverBorder} transition-all duration-500 ${card.hoverShadow} overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#722ed1]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10" dir={card.rtl ? 'rtl' : undefined}>
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-foreground/10 bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                      {card.flag}
                    </div>
                    <span className="font-bold text-foreground text-sm">{card.lang}</span>
                  </div>
                  <span
                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-full tracking-wider border ${card.badgeBg}`}
                  >
                    {card.badge}
                  </span>
                </div>

                {/* Waveform & Play Button */}
                <div className="flex flex-col items-center justify-center py-8 mb-8" dir="ltr">
                  <div className="flex items-end justify-center gap-1.5 h-16 mb-8">
                    {[0.1, 0.3, 0.5, 0.2, 0.4, 0.6].map((delay, i) => (
                      <div
                        key={i}
                        className={`waveform-bar w-1.5 ${card.barColor} rounded-full`}
                        style={{
                          animationDelay: `${delay}s`,
                          opacity: 0.4 + i * 0.12,
                        }}
                      />
                    ))}
                  </div>
                  <button className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center text-background shadow-xl hover:scale-110 active:scale-95 transition-transform duration-300">
                    <Play className="size-8 fill-current" />
                  </button>
                </div>

                <div className="text-center space-y-1">
                  <h3 className="text-foreground font-black text-lg">{card.name}</h3>
                  <p className="text-muted-foreground text-sm font-medium">{card.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Latency Stat */}
        <div className="flex flex-col items-center justify-center mb-24 relative">
          <div className="absolute inset-0 bg-[#722ed1]/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="text-8xl md:text-9xl font-black font-[family-name:var(--font-display)] text-foreground tracking-tighter purple-glow-text mb-4">
            40<span className="text-[#722ed1]">ms</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground font-bold tracking-wide uppercase text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Latence Cartesia Sonic 3 — conversation en temps r&eacute;el
          </div>
        </div>

        {/* Provider Logos */}
        <div className="pt-16 border-t border-border/10">
          <div className="text-center mb-8">
            <span className="text-muted-foreground uppercase tracking-widest text-[10px] font-black">
              Propuls&eacute; par
            </span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16 opacity-50 hover:opacity-100 transition-opacity duration-500">
            {['ElevenLabs', 'Fish Audio', 'Cartesia', 'Azure', 'OpenAI'].map((name) => (
              <div
                key={name}
                className="h-6 flex items-center font-[family-name:var(--font-display)] font-extrabold text-foreground text-lg"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
