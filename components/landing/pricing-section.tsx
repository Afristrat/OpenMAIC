'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export function PricingSection(): React.ReactElement {
  const { t } = useI18n();

  const plans = [
    {
      name: t('landing.pricing.free.name'),
      price: t('landing.pricing.free.price'),
      period: t('landing.pricing.free.period'),
      desc: t('landing.pricing.free.desc'),
      features: [
        t('landing.pricing.free.f1'),
        t('landing.pricing.free.f2'),
        t('landing.pricing.free.f3'),
        t('landing.pricing.free.f4'),
        t('landing.pricing.free.f5'),
        t('landing.pricing.free.f6'),
      ],
      cta: t('landing.pricing.free.cta'),
      highlighted: false,
      checkColor: 'text-emerald-400',
      btnClass:
        'w-full py-3 px-6 rounded-lg border border-border text-foreground font-bold hover:bg-accent transition-all active:scale-95',
    },
    {
      name: t('landing.pricing.pro.name'),
      price: t('landing.pricing.pro.price'),
      period: t('landing.pricing.pro.period'),
      desc: t('landing.pricing.pro.desc'),
      badge: t('landing.pricing.pro.badge'),
      features: [
        t('landing.pricing.pro.f1'),
        t('landing.pricing.pro.f2'),
        t('landing.pricing.pro.f3'),
        t('landing.pricing.pro.f4'),
        t('landing.pricing.pro.f5'),
        t('landing.pricing.pro.f6'),
      ],
      cta: t('landing.pricing.pro.cta'),
      highlighted: true,
      checkColor: 'text-primary',
      btnClass:
        'w-full py-4 px-6 rounded-lg bg-[#722ed1] text-white font-[family-name:var(--font-display)] font-extrabold hover:brightness-110 shadow-lg shadow-[#722ed1]/20 transition-all active:scale-95',
    },
    {
      name: t('landing.pricing.institution.name'),
      price: t('landing.pricing.institution.price'),
      period: t('landing.pricing.institution.period'),
      desc: t('landing.pricing.institution.desc'),
      features: [
        t('landing.pricing.institution.f1'),
        t('landing.pricing.institution.f2'),
        t('landing.pricing.institution.f3'),
        t('landing.pricing.institution.f4'),
        t('landing.pricing.institution.f5'),
        t('landing.pricing.institution.f6'),
        t('landing.pricing.institution.f7'),
      ],
      cta: t('landing.pricing.institution.cta'),
      highlighted: false,
      checkColor: 'text-amber-400',
      btnClass:
        'w-full py-3 px-6 rounded-lg bg-accent text-foreground font-bold hover:brightness-125 transition-all active:scale-95',
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-[family-name:var(--font-display)] font-extrabold tracking-tight text-foreground mb-6">
            {t('landing.pricing.title')}
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t('landing.pricing.subtitle')}
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
              {t('landing.cta.title')}
            </h2>
            <p className="text-xl text-purple-200 leading-relaxed mb-12 font-medium">
              {t('landing.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link
                href="/app"
                className="px-10 py-5 bg-white text-[#722ed1] font-[family-name:var(--font-display)] font-extrabold rounded-xl shadow-2xl hover:bg-purple-50 transition-all scale-100 hover:scale-105 active:scale-95"
              >
                {t('landing.cta.button1')}
              </Link>
              <button className="px-10 py-5 bg-transparent border-2 border-white/30 text-white font-[family-name:var(--font-display)] font-bold rounded-xl hover:bg-white/10 transition-all active:scale-95">
                {t('landing.cta.button2')}
              </button>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-4 px-6 py-2 rounded-full bg-secondary border border-border/10 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
            <span>CNDP Compliant</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>RGPD Compliant</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>3 Langues</span>
          </div>
        </div>
      </div>
    </section>
  );
}
