'use client';

import {
  GraduationCap,
  Headphones,
  Smile,
  Search,
  FileText,
  Brain,
  Quote,
  BarChart3,
  Heart,
  Swords,
  Lightbulb,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export function ClassroomSection(): React.ReactElement {
  const { t } = useI18n();

  const agents = [
    {
      name: t('landing.classroom.agent1Name'),
      role: 'Enseignant',
      description: t('landing.classroom.agent1Desc'),
      icon: GraduationCap,
      borderColor: 'border-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      name: t('landing.classroom.agent2Name'),
      role: 'Assistant',
      description: t('landing.classroom.agent2Desc'),
      icon: Headphones,
      borderColor: 'border-green-500',
      iconColor: 'text-green-500',
    },
    {
      name: t('landing.classroom.agent3Name'),
      role: 'Étudiant',
      description: t('landing.classroom.agent3Desc'),
      icon: Smile,
      borderColor: 'border-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      name: t('landing.classroom.agent4Name'),
      role: 'Étudiant',
      description: t('landing.classroom.agent4Desc'),
      icon: Search,
      borderColor: 'border-pink-500',
      iconColor: 'text-pink-500',
    },
    {
      name: t('landing.classroom.agent5Name'),
      role: 'Assistant',
      description: t('landing.classroom.agent5Desc'),
      icon: FileText,
      borderColor: 'border-cyan-500',
      iconColor: 'text-cyan-500',
    },
    {
      name: t('landing.classroom.agent6Name'),
      role: 'Enseignant',
      description: t('landing.classroom.agent6Desc'),
      icon: Brain,
      borderColor: 'border-purple-500',
      iconColor: 'text-purple-500',
    },
    {
      name: t('landing.classroom.agent7Name'),
      role: 'Enseignant',
      description: t('landing.classroom.agent7Desc'),
      icon: BarChart3,
      borderColor: 'border-indigo-500',
      iconColor: 'text-indigo-500',
    },
    {
      name: t('landing.classroom.agent8Name'),
      role: 'Assistant',
      description: t('landing.classroom.agent8Desc'),
      icon: Heart,
      borderColor: 'border-rose-500',
      iconColor: 'text-rose-500',
    },
    {
      name: t('landing.classroom.agent9Name'),
      role: 'Étudiant',
      description: t('landing.classroom.agent9Desc'),
      icon: Swords,
      borderColor: 'border-red-500',
      iconColor: 'text-red-500',
    },
    {
      name: t('landing.classroom.agent10Name'),
      role: 'Étudiant',
      description: t('landing.classroom.agent10Desc'),
      icon: Lightbulb,
      borderColor: 'border-yellow-500',
      iconColor: 'text-yellow-500',
    },
  ];

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="text-center mb-20">
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/10 text-[#d5baff] text-xs font-bold tracking-widest uppercase mb-6 border border-[#722ed1]/20">
          {t('landing.classroom.eyebrow')}
        </span>
        <h2 className="text-4xl md:text-5xl font-extrabold text-foreground mb-6 leading-tight font-[family-name:var(--font-display)]">
          {t('landing.classroom.title')}
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {t('landing.classroom.subtitle')}
        </p>
      </div>

      {/* Classroom Mockup */}
      <div className="relative mb-32">
        <div className="bg-card rounded-2xl shadow-[0_32px_64px_-16px_rgba(114,46,209,0.12)] overflow-hidden border border-border/10 aspect-[16/10] md:aspect-[21/9] flex">
          {/* Left Panel: Chat */}
          <div className="hidden md:flex flex-col w-72 bg-secondary p-6 border-r border-border/5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              Conversations
            </h3>
            <div className="space-y-4 overflow-y-auto">
              <div className="p-3 rounded-lg bg-card shadow-sm">
                <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Professeur IA</p>
                <p className="text-xs text-foreground leading-snug">
                  Avez-vous compris le concept de l&apos;entonnoir de conversion ?
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-amber-500/20">
                <p className="text-[10px] font-bold text-amber-400 uppercase mb-1">Le Rigolo</p>
                <p className="text-xs text-foreground leading-snug">
                  Moi, le seul entonnoir que je connais, c&apos;est celui pour le g&acirc;teau !
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-pink-500/20">
                <p className="text-[10px] font-bold text-pink-400 uppercase mb-1">Le Curieux</p>
                <p className="text-xs text-foreground leading-snug">
                  Attends, est-ce que &ccedil;a s&apos;applique aussi au B2B non-num&eacute;rique ?
                </p>
              </div>
            </div>
          </div>

          {/* Center Area */}
          <div className="flex-1 flex flex-col relative bg-card">
            <div className="flex-1 p-8 flex items-center justify-center">
              <div className="w-full max-w-2xl aspect-video rounded-xl bg-muted relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#722ed1]/10 to-[#4f46e5]/10 flex items-center justify-center">
                  <div className="text-center text-foreground">
                    <h2 className="text-2xl font-bold">Marketing Strat&eacute;gique</h2>
                    <p className="text-sm opacity-80">Module 04: L&apos;Acquisition Client</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Bottom Row: Avatars */}
            <div className="bg-secondary px-8 py-6 flex items-center justify-center gap-4 md:gap-6 border-t border-border/10">
              {['Prof', 'Asst', 'Rig', 'Moi', 'Cur', 'Sec', 'Pen', 'Ana', 'Coa', 'Cré'].map((name, i) => (
                <div
                  key={name}
                  className={`w-12 h-12 rounded-full border-2 p-0.5 flex items-center justify-center text-xs font-bold ${
                    i === 3
                      ? 'border-[#722ed1] w-14 h-14 -mt-4 shadow-lg bg-card z-10'
                      : 'border-muted-foreground/30 bg-muted'
                  } text-foreground`}
                >
                  {name[0]}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative blurs */}
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-[#722ed1]/5 rounded-full blur-3xl -z-10" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-emerald-400/5 rounded-full blur-3xl -z-10" />
      </div>

      {/* Agent Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-32">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <div
              key={agent.name}
              className={`bg-card p-6 rounded-xl shadow-[0_4px_24px_rgba(114,46,209,0.04)] border-l-4 ${agent.borderColor} hover:translate-y-[-4px] transition-transform duration-300`}
            >
              <div className="flex items-center gap-4 mb-4">
                <Icon className={`size-8 ${agent.iconColor}`} />
                <div>
                  <h3 className="font-bold text-foreground">{agent.name}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {agent.role}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
            </div>
          );
        })}
      </div>

      {/* Quote Callout */}
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative inline-block mb-8">
          <Quote className="size-16 text-[#722ed1]/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Quote className="size-8 text-[#722ed1]" />
          </div>
        </div>
        <div className="pl-8 border-l-2 border-[#722ed1]/20 text-left">
          <blockquote className="text-2xl font-medium text-foreground italic leading-relaxed mb-4">
            &laquo; {t('landing.classroom.quote')} &raquo;
          </blockquote>
          <cite className="not-italic text-[#722ed1] font-bold tracking-tight">
            — {t('landing.classroom.quoteAuthor')}
          </cite>
        </div>
      </div>
    </section>
  );
}
