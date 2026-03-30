/**
 * GET /api/jobs/status
 *
 * Returns job queue statistics for the admin dashboard.
 * Protected by MCP_API_KEY (same key used for the MCP endpoint).
 *
 * Response shape:
 * {
 *   queues: [
 *     { name, waiting, active, completed, failed, delayed, paused }
 *   ]
 * }
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  classroomQueue,
  ttsQueue,
  notificationQueue,
  telemetryQueue,
} from '@/lib/jobs/queue';

// ---------------------------------------------------------------------------
// Auth — reuse MCP_API_KEY as the admin secret
// ---------------------------------------------------------------------------

function authenticate(req: NextRequest): Response | null {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Admin endpoint not configured (MCP_API_KEY missing)' },
        { status: 503 },
      );
    }
    return null; // Dev: open access
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authenticate(req);
  if (authError) return authError as NextResponse;

  const queues = [classroomQueue, ttsQueue, notificationQueue, telemetryQueue];

  const stats = await Promise.all(
    queues.map(async (q) => {
      const counts = await q.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      );
      return { name: q.name, ...counts };
    }),
  );

  return NextResponse.json({ queues: stats });
}
