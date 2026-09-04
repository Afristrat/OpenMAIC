'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { AnchorPlanControl } from '@/components/anchor-plan-control';

export default function AnchorPlanPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const phase = searchParams.get('phase');
  return (
    <AnchorPlanControl
      planId={id}
      deliveryId={searchParams.get('delivery')}
      evaluationPhase={phase === 'cold_30' || phase === 'cold_60' ? phase : null}
    />
  );
}
