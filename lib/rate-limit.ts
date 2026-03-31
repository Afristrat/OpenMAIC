// =============================================================================
// Qalem — Rate Limiting (in-memory sliding window)
// =============================================================================
//
// TODO: Upgrade to Redis (ioredis) for multi-instance deployments.
// Current implementation uses an in-memory Map — suitable for single-instance
// deployments only. Data is lost on process restart, which is acceptable for
// rate limiting (limits reset naturally).
// =============================================================================

import { getUsageSummary } from '@/lib/usage/tracker';

// ---------------------------------------------------------------------------
// Plan-based rate limits
// ---------------------------------------------------------------------------

const PLANS: Record<string, { maxRequests: number; windowMs: number }> = {
  free: { maxRequests: 100, windowMs: 60_000 }, // 100 req/min
  pro: { maxRequests: 1000, windowMs: 60_000 }, // 1 000 req/min
  enterprise: { maxRequests: 10_000, windowMs: 60_000 }, // 10 000 req/min
};

const TTS_LIMITS: Record<string, { maxMinutes: number }> = {
  free: { maxMinutes: 100 }, // per month
  pro: { maxMinutes: 1000 },
  enterprise: { maxMinutes: Infinity },
};

// ---------------------------------------------------------------------------
// Sliding window store (in-memory)
// ---------------------------------------------------------------------------

interface WindowEntry {
  timestamps: number[];
}

/** key → list of request timestamps within the current window */
const windowStore = new Map<string, WindowEntry>();

/** Periodically prune expired entries to avoid memory leaks */
const PRUNE_INTERVAL_MS = 60_000;

function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of windowStore) {
    // Keep only timestamps within the largest possible window (enterprise = 60s)
    const cutoff = now - 60_000;
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) {
      windowStore.delete(key);
    }
  }
}

// Start the pruning interval (only in non-test environments)
if (typeof globalThis !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(pruneExpiredEntries, PRUNE_INTERVAL_MS).unref();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check whether a request is allowed under the rate limit for the given key.
 *
 * @param key  - Unique identifier (e.g. `user:<id>` or `ip:<addr>`)
 * @param plan - Pricing plan (free | pro | enterprise). Defaults to "free".
 */
export async function checkRateLimit(
  key: string,
  plan?: string,
): Promise<RateLimitResult> {
  const planConfig = PLANS[plan ?? 'free'] ?? PLANS.free;
  const now = Date.now();
  const windowStart = now - planConfig.windowMs;

  let entry = windowStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windowStore.set(key, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= planConfig.maxRequests) {
    // Oldest timestamp still in the window — wait until it expires
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + planConfig.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1),
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: planConfig.maxRequests - entry.timestamps.length,
  };
}

// ---------------------------------------------------------------------------
// TTS quota (monthly) — backed by Supabase usage_records
// ---------------------------------------------------------------------------

export interface TTSQuotaResult {
  allowed: boolean;
  usedMinutes: number;
  limitMinutes: number;
}

/**
 * Check whether an organisation has remaining TTS quota for the current month.
 * Queries the usage_records table via getUsageSummary for persistence across restarts.
 */
export async function checkTTSQuota(
  orgId: string,
  plan: string,
): Promise<TTSQuotaResult> {
  const limitConfig = TTS_LIMITS[plan] ?? TTS_LIMITS.free;

  let usedMinutes = 0;
  try {
    const summary = await getUsageSummary(orgId);
    usedMinutes = summary.ttsMinutes;
  } catch {
    // If Supabase is unavailable, fail open (allow the request)
    // to avoid blocking the primary path.
  }

  return {
    allowed: usedMinutes < limitConfig.maxMinutes,
    usedMinutes,
    limitMinutes: limitConfig.maxMinutes,
  };
}
