'use client';

import {
  Workflow,
  FlaskConical,
  Terminal,
  BadgeCheck,
  WifiOff,
  Wallet,
  Bot,
  Sparkles,
} from 'lucide-react';

const features = [
  {
    icon: Workflow,
    title: 'Hub MCP',
    desc: 'Connectez NotebookLM, Notion, Google Drive. Vos sources enrichissent le cours.',
    iconColor: 'text-primary bg-primary/10',
  },
  {
    icon: FlaskConical,
    title: 'Lab Simulation 3D',
    desc: "Physique interactive avec Three.js. L'apprenant manipule les param\u00e8tres en temps r\u00e9el.",
    iconColor: 'text-emerald-400 bg-emerald-400/10',
  },
  {
    icon: Terminal,
    title: 'Code Sandbox',
    desc: '\u00C9diteur Monaco + ex\u00e9cution Python/JS dans le navigateur. Tests automatiques.',
    iconColor: 'text-amber-400 bg-amber-400/10',
  },
  {
    icon: BadgeCheck,
    title: 'Certificats V\u00e9rifiables',
    desc: 'QR code unique, v\u00e9rifiable publiquement. Partageable sur LinkedIn.',
    iconColor: 'text-primary bg-primary/10',
  },
  {
    icon: WifiOff,
    title: 'Mode Hors-Ligne',
    desc: 'PWA avec sync automatique. R\u00e9visez dans le bus sans internet.',
    iconColor: 'text-emerald-400 bg-emerald-400/10',
  },
  {
    icon: Wallet,
    title: 'Paiement Mobile',
    desc: 'Orange Money, Wave, CinetPay. Pas de carte bancaire requise.',
    iconColor: 'text-amber-400 bg-amber-400/10',
  },
  {
    icon: Bot,
    title: 'Agent Bazaar',
    desc: "Marketplace d'agents p\u00e9dagogiques. Importez les mieux not\u00e9s en 1 clic.",
    iconColor: 'text-primary bg-primary/10',
  },
  {
    icon: Sparkles,
    title: 'Pedagogy Genome',
    desc: "L'IA apprend \u00e0 enseigner. Plus vous l'utilisez, meilleur il devient.",
    iconColor: 'text-emerald-400 bg-emerald-400/10',
  },
];

const skills = [
  { emoji: '\uD83C\uDFE5', label: 'Formation M\u00e9dicale' },
  { emoji: '\u2696\uFE0F', label: 'Moot Court Juridique' },
  { emoji: '\uD83D\uDCBB', label: 'Coding Workshop' },
  { emoji: '\uD83D\uDCD0', label: 'Formation Design Pro' },
];

export function FeaturesGrid(): React.ReactElement {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-8">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/20 text-primary font-bold text-xs tracking-widest uppercase border border-primary/20">
            ET BIEN PLUS ENCORE
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-foreground font-[family-name:var(--font-display)] tracking-tight">
            Chaque d&eacute;tail compte
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-primary to-emerald-400 mx-auto rounded-full mt-6" />
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative bg-secondary p-6 rounded-[16px] transition-all duration-300 hover:bg-gradient-to-br hover:from-accent hover:to-muted border border-border/10"
              >
                <div
                  className={`mb-4 ${feature.iconColor} w-12 h-12 flex items-center justify-center rounded-xl group-hover:scale-110 transition-transform`}
                >
                  <Icon className="size-7" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground font-[family-name:var(--font-display)]">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Skills Showcase */}
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground font-semibold uppercase tracking-[0.2em] text-xs mb-8">
            Skills sp&eacute;cialis&eacute;s inclus
          </span>
          <div className="flex flex-wrap justify-center gap-4">
            {skills.map((skill) => (
              <div
                key={skill.label}
                className="px-6 py-3 rounded-full bg-accent border border-border/20 flex items-center gap-3 transition-transform hover:-translate-y-1"
              >
                <span className="text-xl">{skill.emoji}</span>
                <span className="font-semibold text-foreground tracking-wide">{skill.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
