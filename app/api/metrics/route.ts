import { NextRequest, NextResponse } from 'next/server';
import { serializeMetrics } from '@/lib/metrics';

export function GET(req: NextRequest): NextResponse {
  const apiKey = process.env.MCP_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== apiKey) return new NextResponse('Unauthorized', { status: 401 });
  }

  return new NextResponse(serializeMetrics(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
