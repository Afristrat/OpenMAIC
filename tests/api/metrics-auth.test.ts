import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/metrics', () => ({ serializeMetrics: () => 'qalem_up 1\n' }));

import { GET } from '@/app/api/metrics/route';

function req(authorization?: string): NextRequest {
  return new Request('http://localhost/api/metrics', {
    headers: authorization ? { authorization } : {},
  }) as unknown as NextRequest;
}

describe('GET /api/metrics', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuse en production sans MCP_API_KEY (503)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_API_KEY', '');
    expect(GET(req()).status).toBe(503);
  });

  it('reste ouvert hors production sans MCP_API_KEY', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MCP_API_KEY', '');
    expect(GET(req()).status).toBe(200);
  });

  it('exige le jeton quand MCP_API_KEY est définie', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_API_KEY', 'secret-key');
    expect(GET(req()).status).toBe(401);
    expect(GET(req('Bearer mauvais')).status).toBe(401);
    expect(GET(req('Bearer secret-key')).status).toBe(200);
  });
});
