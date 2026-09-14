import { NextResponse } from 'next/server';
import { localContentVerifyingKey } from '@/lib/server/local-content-crypto';

export function GET() {
  try {
    return NextResponse.json(
      { success: true, algorithm: 'Ed25519', publicKey: localContentVerifyingKey() },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Local client signing unavailable' },
      { status: 503 },
    );
  }
}
