import { LandingNav } from '@/components/landing/landing-nav';
import { HeroSection } from '@/components/landing/hero-section';
import { ClassroomSection } from '@/components/landing/classroom-section';
import { VoicesSection } from '@/components/landing/voices-section';
import { FSRSSection } from '@/components/landing/fsrs-section';
import { InstitutionsSection } from '@/components/landing/institutions-section';
import { FeaturesGrid } from '@/components/landing/features-grid';
import { PricingSection } from '@/components/landing/pricing-section';
import { Footer } from '@/components/landing/footer';

// The production build must render the commercial homepage from this route module.
// Static prerendering previously emitted /app's generator as index.html for this route.
export const dynamic = 'force-dynamic';

export default function LandingPage(): React.ReactElement {
  return (
    <div data-testid="commercial-homepage">
      <LandingNav />
      <HeroSection />
      <div id="classroom">
        <ClassroomSection />
      </div>
      <div id="voices">
        <VoicesSection />
      </div>
      <FSRSSection />
      <InstitutionsSection />
      <div id="features">
        <FeaturesGrid />
      </div>
      <div id="pricing">
        <PricingSection />
      </div>
      <Footer />
    </div>
  );
}
