'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

const plans = [
  {
    name: 'Gratuit',
    price: '0 MAD',
    period: '/mois',
    desc: 'Pour les formateurs ind\u00e9pendants',
    features: [
      'Auto-h\u00e9berg\u00e9',
      'Cours illimit\u00e9s',
      '3 langues',
      '9 providers TTS',
      'FSRS',
      'Export PPTX',
    ],
    cta: 'Installer',
    highlighted: false,
    checkColor: 'text-emerald-400',
    btnClass:
      'w-full py-3 px-6 rounded-lg border border-border text-foreground font-bold hover:bg-accent transition-all active:scale-95',
  },
  {
    name: 'Professionnel',
    price: '3 000 MAD',
    period: '/mois',
    desc: 'Pour les centres de formation',
    badge: 'Recommand\u00e9',
    features: [
      'Tout du plan Gratuit',
      '5 formateurs',
      '100 apprenants',
      'Support email',
      'Mises \u00e0 jour',
      'Templates',
    ],
    cta: 'Essai 30 jours',
    highlighted: true,
    checkColor: 'text-primary',
    btnClass:
      'w-full py-4 px-6 rounded-lg bg-[#722ed1] text-white font-[family-name:var(--font-display)] font-extrabold hover:brightness-110 shadow-lg shadow-[#722ed1]/20 transition-all active:scale-95',
  },
  {
    name: 'Institution',
    price: 'Sur devis',
    period: '',
    desc: "Pour les universit\u00e9s et l'OFPPT",
    features: [
      'Tout du plan Pro',
      'Formateurs illimit\u00e9s',
      'LTI 1.3 + SSO',
      'Reporting',
      'Support WhatsApp',
      'Formation sur site',
      'SLA 99.5%',
    ],
    cta: 'Nous contacter',
    highlighted: false,
    checkColor: 'text-amber-400',
    btnClass:
      'w-full py-3 px-6 rounded-lg bg-accent text-foreground font-bold hover:brightness-125 transition-all active:scale-95',
  },
];

export function PricingSection(): React.ReactElement {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-[family-name:var(--font-display)] font-extrabold tracking-tight text-foreground mb-6">
            Commencez gratuitement
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Open-source et auto-h&eacute;berg&eacute;. Payez uniquement pour le support et les
            fonctionnalit&eacute;s premium.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-32">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col p-8 rounded-[12px] pricing-card-glow ${
                plan.highlighted
                  ? 'bg-card border-2 border-[#722ed1] relative transform md:-translate-y-4 shadow-2xl'
                  : 'bg-secondary border border-border/10 hover:border-border/30 transition-all group'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#722ed1] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  {plan.badge}
                </div>
              )}
              <div className="mb-8">
                <h3
                  className={`text-lg font-[family-name:var(--font-display)] font-bold mb-2 ${
                    plan.highlighted ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-[family-name:var(--font-display)] font-extrabold text-foreground">
                    {plan.price}
                  </span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
                <p className="text-sm text-muted-foreground/80">{plan.desc}</p>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-muted-foreground">
                    <CheckCircle className={`size-4 ${plan.checkColor}`} />
                    <span className={plan.highlighted ? 'text-foreground font-medium' : ''}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <button className={plan.btnClass}>{plan.cta}</button>
            </div>
          ))}
        </div>

        {/* Final CTA Section */}
        <div className="hero-gradient rounded-3xl p-12 md:p-20 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="relative z-10 max-w-3xl">
            <h2 className="text-4xl md:text-6xl font-[family-name:var(--font-display)] font-extrabold text-white tracking-tight mb-8">
              Pr&ecirc;t &agrave; transformer votre formation ?
            </h2>
            <p className="text-xl text-purple-200 leading-relaxed mb-12 font-medium">
              D&eacute;ployez Qalem en 15 minutes. Cr&eacute;ez votre premier cours en 5 minutes
              de plus.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link
                href="/app"
                className="px-10 py-5 bg-white text-[#722ed1] font-[family-name:var(--font-display)] font-extrabold rounded-xl shadow-2xl hover:bg-purple-50 transition-all scale-100 hover:scale-105 active:scale-95"
              >
                Essayer la D&eacute;mo
              </Link>
              <button className="px-10 py-5 bg-transparent border-2 border-white/30 text-white font-[family-name:var(--font-display)] font-bold rounded-xl hover:bg-white/10 transition-all active:scale-95">
                Guide d&apos;Installation
              </button>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-4 px-6 py-2 rounded-full bg-secondary border border-border/10 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
            <span>Open-source</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>Auto-h&eacute;berg&eacute;</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>CNDP Compliant</span>
          </div>
        </div>
      </div>
    </section>
  );
}
