import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/landing-nav';
import { ClassroomSection } from '@/components/landing/classroom-section';
import { VoicesSection } from '@/components/landing/voices-section';
import { FSRSSection } from '@/components/landing/fsrs-section';
import { FeaturesGrid } from '@/components/landing/features-grid';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Fonctionnalit\u00e9s \u2014 Qalem',
  description:
    'D\u00e9couvrez les fonctionnalit\u00e9s de Qalem : classe interactive multi-agents, voix naturelles FR/AR/EN, r\u00e9p\u00e9tition espac\u00e9e FSRS, hub MCP, mode hors-ligne.',
};

export default function FeaturesPage(): React.ReactElement {
  return (
    <>
      <LandingNav />
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 max-w-7xl mx-auto text-center">
        <span className="inline-block px-4 py-1.5 rounded-full bg-[#722ed1]/20 text-primary font-bold text-xs tracking-widest uppercase border border-primary/20 mb-6">
          FONCTIONNALIT&Eacute;S
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold font-[family-name:var(--font-display)] tracking-tight text-foreground mb-6">
          Fonctionnalit&eacute;s Qalem &mdash; Classe Interactive IA
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Transformez n&apos;importe quel document en exp&eacute;rience p&eacute;dagogique
          immersive. Multi-agents, voix naturelles, r&eacute;p&eacute;tition espac&eacute;e et bien
          plus.
        </p>
        <div className="w-24 h-1 bg-gradient-to-r from-primary to-emerald-400 mx-auto rounded-full mt-8" />
      </section>

      {/* Sections */}
      <ClassroomSection />
      <VoicesSection />
      <FSRSSection />
      <FeaturesGrid />
      <Footer />
    </>
  );
}
