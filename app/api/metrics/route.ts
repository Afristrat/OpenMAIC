import { NextRequest, NextResponse } from 'next/server';
import { serializeMetrics } from '@/lib/metrics';
import { secretsMatch } from '@/lib/server/api-key-compare';

export function GET(req: NextRequest): NextResponse {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) {
    // Même règle que /api/mcp : en production, refuser de servir sans authentification configurée.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Metrics endpoint not configured', { status: 503 });
    }
  } else {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!secretsMatch(token, apiKey)) return new NextResponse('Unauthorized', { status: 401 });
  }

  return new NextResponse(serializeMetrics(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
