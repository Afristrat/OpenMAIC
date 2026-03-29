'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

type PricingFeature = {
  labelKey: string;
};

type PricingCard = {
  titleKey: string;
  priceKey: string;
  subtitleKey: string;
  features: PricingFeature[];
  ctaKey: string;
  href: string;
  highlighted?: boolean;
  dark?: boolean;
  badgeKey?: string;
};

const cards: PricingCard[] = [
  {
    titleKey: 'pricing.free.title',
    priceKey: 'pricing.free.price',
    subtitleKey: 'pricing.free.subtitle',
    features: [
      { labelKey: 'pricing.free.f1' },
      { labelKey: 'pricing.free.f2' },
      { labelKey: 'pricing.free.f3' },
      { labelKey: 'pricing.free.f4' },
      { labelKey: 'pricing.free.f5' },
      { labelKey: 'pricing.free.f6' },
    ],
    ctaKey: 'pricing.free.cta',
    href: '/auth',
  },
  {
    titleKey: 'pricing.pro.title',
    priceKey: 'pricing.pro.price',
    subtitleKey: 'pricing.pro.subtitle',
    features: [
      { labelKey: 'pricing.pro.f1' },
      { labelKey: 'pricing.pro.f2' },
      { labelKey: 'pricing.pro.f3' },
      { labelKey: 'pricing.pro.f4' },
      { labelKey: 'pricing.pro.f5' },
      { labelKey: 'pricing.pro.f6' },
    ],
    ctaKey: 'pricing.pro.cta',
    href: '/auth?plan=pro',
    highlighted: true,
    badgeKey: 'pricing.pro.badge',
  },
  {
    titleKey: 'pricing.institution.title',
    priceKey: 'pricing.institution.price',
    subtitleKey: 'pricing.institution.subtitle',
    features: [
      { labelKey: 'pricing.institution.f1' },
      { labelKey: 'pricing.institution.f2' },
      { labelKey: 'pricing.institution.f3' },
      { labelKey: 'pricing.institution.f4' },
      { labelKey: 'pricing.institution.f5' },
      { labelKey: 'pricing.institution.f6' },
      { labelKey: 'pricing.institution.f7' },
    ],
    ctaKey: 'pricing.institution.cta',
    href: 'mailto:contact@qalem.ma',
    dark: true,
  },
];

export default function PricingPage(): React.ReactElement {
  const { t } = useI18n();

  return (
    <div className="min-h-screen px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t('pricing.title')}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 max-w-6xl mx-auto">
          {cards.map((card) => {
            const isMailto = card.href.startsWith('mailto:');

            return (
              <div
                key={card.titleKey}
                className={cn(
                  'relative flex flex-col rounded-2xl p-8 shadow-sm ring-1 transition-shadow hover:shadow-md',
                  card.highlighted
                    ? 'ring-2 ring-purple-500 dark:ring-purple-400'
                    : 'ring-border/60',
                  card.dark
                    ? 'bg-gray-900 text-white dark:bg-gray-950'
                    : 'bg-background text-foreground',
                )}
              >
                {/* Badge */}
                {card.badgeKey && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-4 py-1 text-xs font-semibold text-white">
                    {t(card.badgeKey)}
                  </span>
                )}

                {/* Title */}
                <h2 className="text-xl font-semibold">{t(card.titleKey)}</h2>

                {/* Price */}
                <p className="mt-4 text-4xl font-bold tracking-tight">{t(card.priceKey)}</p>

                {/* Subtitle */}
                <p
                  className={cn(
                    'mt-2 text-sm',
                    card.dark ? 'text-gray-400' : 'text-muted-foreground',
                  )}
                >
                  {t(card.subtitleKey)}
                </p>

                {/* Features */}
                <ul className="mt-8 flex-1 space-y-3">
                  {card.features.map((f) => (
                    <li key={f.labelKey} className="flex items-start gap-3">
                      <Check
                        className={cn(
                          'mt-0.5 size-5 shrink-0',
                          card.highlighted
                            ? 'text-purple-500'
                            : card.dark
                              ? 'text-green-400'
                              : 'text-green-600 dark:text-green-400',
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm',
                          card.dark ? 'text-gray-300' : 'text-muted-foreground',
                        )}
                      >
                        {t(f.labelKey)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isMailto ? (
                  <a
                    href={card.href}
                    className={cn(
                      'mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors',
                      'bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/20',
                    )}
                  >
                    {t(card.ctaKey)}
                  </a>
                ) : (
                  <Link
                    href={card.href}
                    className={cn(
                      'mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors',
                      card.highlighted
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                    )}
                  >
                    {t(card.ctaKey)}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
