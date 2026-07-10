// ---------------------------------------------------------------------------
// Plan Definitions & Quota Enforcement for Qalem
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'pro' | 'enterprise';

export type Plan = {
  id: PlanId;
  name: string;
  ttsMinutesPerMonth: number;
  classroomsMax: number;
  membersMax: number;
  price: { MAD: number | null; USD: number | null };
};

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number;
};

// ---------------------------------------------------------------------------
// Plan catalogue
// ---------------------------------------------------------------------------

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    ttsMinutesPerMonth: 100,
    classroomsMax: 10,
    membersMax: 1,
    price: { MAD: 0, USD: 0 },
  },
  pro: {
    id: 'pro',
    name: 'Professionnel',
    ttsMinutesPerMonth: 1000,
    classroomsMax: Infinity,
    membersMax: 5,
    price: { MAD: 3000, USD: 30 },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Institution',
    ttsMinutesPerMonth: Infinity,
    classroomsMax: Infinity,
    membersMax: Infinity,
    price: { MAD: null, USD: null }, // custom pricing
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidPlanId(id: string): id is PlanId {
  return id in PLANS;
}

export function getPlan(planId: string): Plan {
  if (isValidPlanId(planId)) return PLANS[planId];
  return PLANS.free;
}

// Metric → plan limit mapping
function getLimitForMetric(plan: Plan, metric: string): number {
  switch (metric) {
    case 'tts_minutes':
      return plan.ttsMinutesPerMonth;
    case 'classrooms':
      return plan.classroomsMax;
    case 'members':
      return plan.membersMax;
    default:
      return Infinity; // unknown metrics are uncapped
  }
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Current billing period as YYYY-MM
function currentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Quota checking
// ---------------------------------------------------------------------------

export async function checkQuota(
  orgId: string,
  metric: string,
): Promise<QuotaCheck> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // No Supabase → allow (development mode)
    return { allowed: true, used: 0, limit: Infinity };
  }

  // Fetch org plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single();

  const plan = getPlan(org?.plan ?? 'free');
  const limit = getLimitForMetric(plan, metric);

  if (limit === Infinity) {
    return { allowed: true, used: 0, limit: Infinity };
  }

  // Fetch current usage
  const period = currentBillingPeriod();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  const { data: records } = await (supabase as any)
    .from('usage_records')
    .select('quantity')
    .eq('org_id', orgId)
    .eq('metric', metric)
    .eq('billing_period', period);

  const used = (records ?? []).reduce(
    (sum: number, r: { quantity: number }) => sum + Number(r.quantity),
    0,
  );

  return {
    allowed: used < limit,
    used,
    limit,
  };
}
