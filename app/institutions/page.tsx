import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/landing-nav';
import { InstitutionsSection } from '@/components/landing/institutions-section';
import { Footer } from '@/components/landing/footer';
import {
  BookOpen,
  Users,
  BarChart3,
  Shield,
  Workflow,
  Settings,
  GraduationCap,
  FileText,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Qalem pour les Institutions \u2014 LMS, Organisations, Reporting',
  description:
    'Int\u00e9grez Qalem \u00e0 votre LMS via LTI 1.3. Organisations multi-tenant, reporting Kirkpatrick L1-L4, souverainet\u00e9 des donn\u00e9es CNDP/RGPD.',
};

const ltiSteps = [
  {
    step: '1',
    title: 'Enregistrez Qalem dans votre LMS',
    desc: "Ajoutez l'URL de configuration LTI 1.3 de Qalem dans la section \u00ab\u00a0Outils externes\u00a0\u00bb de votre Moodle, Canvas ou Blackboard.",
  },
  {
    step: '2',
    title: 'Configurez les cl\u00e9s',
    desc: "Qalem g\u00e9n\u00e8re automatiquement les cl\u00e9s JWKS. Copiez l'ID client et le secret dans votre LMS.",
  },
  {
    step: '3',
    title: 'Cr\u00e9ez une activit\u00e9 Qalem',
    desc: "Ajoutez une activit\u00e9 LTI dans votre cours. L'apprenant acc\u00e8de directement \u00e0 la classe interactive depuis son LMS habituel.",
  },
  {
    step: '4',
    title: 'Les notes remontent automatiquement',
    desc: 'Les r\u00e9sultats des quiz et certificats sont synchronis\u00e9s avec le carnet de notes du LMS via LTI Advantage.',
  },
];

const orgFeatures = [
  {
    icon: Users,
    title: '4 r\u00f4les distincts',
    desc: 'Admin, Manager, Formateur, Apprenant. Chaque r\u00f4le a des permissions adapt\u00e9es \u00e0 sa mission.',
  },
  {
    icon: BookOpen,
    title: 'Biblioth\u00e8que partag\u00e9e',
    desc: "Centralisez les classes interactives. Les formateurs partagent et r\u00e9utilisent les contenus de l'organisation.",
  },
  {
    icon: Settings,
    title: 'Templates par secteur',
    desc: 'M\u00e9dical, juridique, technique, design. Des mod\u00e8les adapt\u00e9s \u00e0 chaque secteur professionnel.',
  },
  {
    icon: GraduationCap,
    title: 'Parcours curriculaires',
    desc: "Organisez les formations en parcours structur\u00e9s avec pr\u00e9requis et progression guid\u00e9e.",
  },
];

const reportingFeatures = [
  {
    icon: BarChart3,
    title: 'Kirkpatrick L1 \u00e0 L4',
    desc: 'Mesurez la satisfaction, les acquis, le transfert en situation et les r\u00e9sultats op\u00e9rationnels.',
  },
  {
    icon: FileText,
    title: 'Export PDF & CSV',
    desc: "Rapports pr\u00eats pour les audits d'accr\u00e9ditation. G\u00e9n\u00e9r\u00e9s en un clic.",
  },
  {
    icon: Workflow,
    title: 'M\u00e9triques individuelles',
    desc: 'Taux de compl\u00e9tion, scores moyens, temps pass\u00e9, courbe FSRS par apprenant.',
  },
  {
    icon: Shield,
    title: 'Conformit\u00e9 CNDP & RGPD',
    desc: 'Auto-h\u00e9berg\u00e9 via Docker. Donn\u00e9es localis\u00e9es sur vos serveurs. Z\u00e9ro transfert non consenti.',
  },
];

export default function InstitutionsPage(): React.ReactElement {
  return (
    <>
      <LandingNav />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 max-w-7xl mx-auto text-center">
        <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold tracking-widest uppercase mb-6 font-[family-name:var(--font-display)]">
          POUR LES INSTITUTIONS
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-6">
          Qalem pour les Institutions &mdash; LMS, Organisations, Reporting
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          LTI 1.3, organisations multi-tenant, reporting pour les accr&eacute;ditations et
          souverainet&eacute; des donn&eacute;es. Tout ce dont votre institution a besoin.
        </p>
        <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-emerald-400 mx-auto rounded-full mt-8" />
      </section>

      {/* LTI Integration Guide */}
      <section className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-4">
            Int&eacute;gration LTI 1.3 en 4 &eacute;tapes
          </h2>
          <p className="text-muted-foreground text-lg mb-12 max-w-2xl">
            Compatible Moodle, Canvas, Blackboard et tout LMS certifi&eacute; LTI 1.3.
            Z&eacute;ro changement de workflow pour vos formateurs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {ltiSteps.map((item) => (
              <div
                key={item.step}
                className="relative bg-background rounded-2xl p-6 border border-border/10 hover:border-[#722ed1]/20 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#722ed1]/10 text-[#d5baff] font-black text-lg flex items-center justify-center mb-4 font-[family-name:var(--font-display)]">
                  {item.step}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2 font-[family-name:var(--font-display)]">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Existing Institutions Section */}
      <InstitutionsSection />

      {/* Organization Features */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-4">
            Gestion d&apos;organisation avanc&eacute;e
          </h2>
          <p className="text-muted-foreground text-lg mb-12 max-w-2xl">
            Multi-tenant natif. G&eacute;rez formateurs, apprenants et contenus depuis un tableau de
            bord centralis&eacute;.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {orgFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex gap-5 p-6 rounded-2xl bg-secondary border border-border/10 hover:bg-accent/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Icon className="size-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-1 font-[family-name:var(--font-display)]">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Reporting Features */}
      <section className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-4">
            Reporting &amp; Accr&eacute;ditations
          </h2>
          <p className="text-muted-foreground text-lg mb-12 max-w-2xl">
            Des rapports pr&ecirc;ts pour les audits, du Kirkpatrick L1 aux exports CSV.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {reportingFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex gap-5 p-6 rounded-2xl bg-background border border-border/10 hover:border-amber-500/20 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Icon className="size-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-1 font-[family-name:var(--font-display)]">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-6">
            Pr&ecirc;t &agrave; transformer votre institution ?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Pilote gratuit de 30 jours. D&eacute;ploiement accompagn&eacute;. Support d&eacute;di&eacute;.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:contact@qalem.ma"
              className="bg-[#722ed1] text-white px-8 py-3 rounded-lg text-sm font-bold shadow-md hover:scale-95 active:scale-90 transition-transform"
            >
              Contacter l&apos;&eacute;quipe commerciale
            </a>
            <a
              href="/pricing"
              className="bg-white/10 text-foreground px-8 py-3 rounded-lg text-sm font-bold border border-border/20 hover:bg-white/20 transition-colors"
            >
              Voir les tarifs
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
