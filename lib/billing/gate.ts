// ---------------------------------------------------------------------------
// Plan Gating Middleware — enforce plan requirements and quotas
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlan, checkQuota, type PlanId } from './plans';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GateResult = {
  allowed: boolean;
  currentPlan: string;
  response?: NextResponse;
};

type QuotaGateResult = {
  allowed: boolean;
  used: number;
  limit: number;
  response?: NextResponse;
};

// ---------------------------------------------------------------------------
// Plan hierarchy
// ---------------------------------------------------------------------------

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// requirePlan — check minimum plan level
// ---------------------------------------------------------------------------

export async function requirePlan(
  orgId: string,
  minimumPlan: 'pro' | 'enterprise',
): Promise<GateResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // No Supabase → allow in dev
    return { allowed: true, currentPlan: 'enterprise' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single();

  const currentPlanId = (org?.plan ?? 'free') as PlanId;
  const currentPlan = getPlan(currentPlanId);
  const currentRank = PLAN_RANK[currentPlanId] ?? 0;
  const requiredRank = PLAN_RANK[minimumPlan];

  if (currentRank >= requiredRank) {
    return { allowed: true, currentPlan: currentPlan.name };
  }

  return {
    allowed: false,
    currentPlan: currentPlan.name,
    response: NextResponse.json(
      {
        error: 'Plan upgrade required',
        code: 'PLAN_REQUIRED',
        currentPlan: currentPlan.id,
        requiredPlan: minimumPlan,
      },
      { status: 402 },
    ),
  };
}

// ---------------------------------------------------------------------------
// checkAndEnforceQuota — check + return 429 when exceeded
// ---------------------------------------------------------------------------

export async function checkAndEnforceQuota(
  orgId: string,
  metric: string,
): Promise<QuotaGateResult> {
  const quota = await checkQuota(orgId, metric);

  if (quota.allowed) {
    return { allowed: true, used: quota.used, limit: quota.limit };
  }

  return {
    allowed: false,
    used: quota.used,
    limit: quota.limit,
    response: NextResponse.json(
      {
        error: 'Quota exceeded',
        code: 'QUOTA_EXCEEDED',
        metric,
        used: quota.used,
        limit: quota.limit,
      },
      { status: 429 },
    ),
  };
}
