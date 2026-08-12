import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Qalem public edge timeouts', () => {
  it('allows the complete five-minute classroom-plan request', () => {
    const config = readFileSync(resolve('infra/coolify/qalem-edge.nginx.conf'), 'utf8');
    const readTimeout = config.match(/proxy_read_timeout\s+(\d+)s;/)?.[1];
    const sendTimeout = config.match(/proxy_send_timeout\s+(\d+)s;/)?.[1];

    expect(Number(readTimeout)).toBeGreaterThan(300);
    expect(Number(sendTimeout)).toBeGreaterThan(300);
  });
});
