import type { Metadata } from 'next';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { code } = await params;

  return {
    title: `Verify Certificate ${code} | Qalem`,
    description: 'Verify an official Qalem certificate of completion. Confirm that a learner has successfully completed a course.',
    openGraph: {
      title: `Qalem Certificate Verification`,
      description: `Verify certificate ${code} on Qalem — the open-source AI interactive classroom.`,
      type: 'website',
      siteName: 'Qalem',
      url: `/verify/${code}`,
    },
    twitter: {
      card: 'summary',
      title: 'Qalem Certificate Verification',
      description: `Verify certificate ${code} on Qalem.`,
    },
  };
}

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
