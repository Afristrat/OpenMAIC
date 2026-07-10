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
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface FeatureItem {
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  iconColor: string;
}

const FEATURE_DEFS: FeatureItem[] = [
  { icon: Workflow,     titleKey: 'landing.features.hub_mcp',         descKey: 'landing.features.hub_mcp_desc',         iconColor: 'text-primary bg-primary/10' },
  { icon: FlaskConical, titleKey: 'landing.features.lab_sim',         descKey: 'landing.features.lab_sim_desc',         iconColor: 'text-emerald-400 bg-emerald-400/10' },
  { icon: Terminal,     titleKey: 'landing.features.code_sandbox',    descKey: 'landing.features.code_sandbox_desc',    iconColor: 'text-amber-400 bg-amber-400/10' },
  { icon: BadgeCheck,   titleKey: 'landing.features.certificates',    descKey: 'landing.features.certificates_desc',    iconColor: 'text-primary bg-primary/10' },
  { icon: WifiOff,      titleKey: 'landing.features.offline',         descKey: 'landing.features.offline_desc',         iconColor: 'text-emerald-400 bg-emerald-400/10' },
  { icon: Wallet,       titleKey: 'landing.features.mobile_pay',      descKey: 'landing.features.mobile_pay_desc',      iconColor: 'text-amber-400 bg-amber-400/10' },
  { icon: Bot,          titleKey: 'landing.features.agent_bazaar',    descKey: 'landing.features.agent_bazaar_desc',    iconColor: 'text-primary bg-primary/10' },
  { icon: Sparkles,     titleKey: 'landing.features.pedagogy_genome', descKey: 'landing.features.pedagogy_genome_desc', iconColor: 'text-emerald-400 bg-emerald-400/10' },
];

interface SkillItem {
  emoji: string;
  labelKey: string;
}

const SKILL_DEFS: SkillItem[] = [
  { emoji: '\uD83C\uDFE5', labelKey: 'landing.features.skill_medical' },
  { emoji: '\u2696\uFE0F', labelKey: 'landing.features.skill_legal' },
  { emoji: '\uD83D\uDCBB', labelKey: 'landing.features.skill_coding' },
  { emoji: '\uD83D\uDCD0', labelKey: 'landing.features.skill_design' },
];

export function FeaturesGrid(): React.ReactElement {
  const { t } = useI18n();

  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-8">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/20 text-primary font-bold text-xs tracking-widest uppercase border border-primary/20">
            {t('landing.features.eyebrow')}
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-foreground font-[family-name:var(--font-display)] tracking-tight">
            {t('landing.features.title')}
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-primary to-emerald-400 mx-auto rounded-full mt-6" />
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {FEATURE_DEFS.map((feature) => {
            const Icon = feature.icon;
            const title = t(feature.titleKey);
            return (
              <div
                key={feature.titleKey}
                className="group relative bg-secondary p-6 rounded-[16px] transition-all duration-300 hover:bg-gradient-to-br hover:from-accent hover:to-muted border border-border/10"
              >
                <div
                  className={`mb-4 ${feature.iconColor} w-12 h-12 flex items-center justify-center rounded-xl group-hover:scale-110 transition-transform`}
                >
                  <Icon className="size-7" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground font-[family-name:var(--font-display)]">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(feature.descKey)}</p>
              </div>
            );
          })}
        </div>

        {/* Skills Showcase */}
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground font-semibold uppercase tracking-[0.2em] text-xs mb-8">
            {t('landing.features.skills_label')}
          </span>
          <div className="flex flex-wrap justify-center gap-4">
            {SKILL_DEFS.map((skill) => (
              <div
                key={skill.labelKey}
                className="px-6 py-3 rounded-full bg-accent border border-border/20 flex items-center gap-3 transition-transform hover:-translate-y-1"
              >
                <span className="text-xl">{skill.emoji}</span>
                <span className="font-semibold text-foreground tracking-wide">{t(skill.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
