import { NextResponse } from 'next/server';

/** Public liveness probe: it must stay independent from databases and providers. */
export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok' },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
