import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(resolve('infra/coolify/qalem-edge.nginx.conf'), 'utf8');

describe('Qalem public edge client address', () => {
  it('overwrites X-Real-IP and X-Forwarded-For instead of appending client values', () => {
    expect(config).toMatch(/proxy_set_header\s+X-Real-IP\s+\$remote_addr;/);
    expect(config).toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;/);
    expect(config).not.toContain('$proxy_add_x_forwarded_for');
  });

  it('only trusts private-range hops when resolving the real client address', () => {
    const trusted = [...config.matchAll(/set_real_ip_from\s+([^;]+);/g)].map((m) => m[1]);

    expect(trusted.length).toBeGreaterThan(0);
    expect(trusted).not.toContain('0.0.0.0/0');
    expect(trusted.every((range) => /^(10\.|172\.16\.|192\.168\.)/.test(range))).toBe(true);
    expect(config).toMatch(/real_ip_header\s+X-Forwarded-For;/);
    expect(config).toMatch(/real_ip_recursive\s+on;/);
  });
});
