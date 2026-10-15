import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';

function apiRequest(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/chat', { headers: { 'x-real-ip': ip } });
}

describe('proxy rate limiting, regroupement IPv6 par /64', () => {
  it('ne donne pas un seau neuf à chaque adresse d’un même /64', async () => {
    let blockedAt: number | null = null;
    for (let index = 0; index < 150 && blockedAt === null; index += 1) {
      const response = await proxy(apiRequest(`2001:db8:5:7::${index.toString(16)}:1`));
      if (response.status === 429) blockedAt = index;
    }
    expect(blockedAt).not.toBeNull();
    expect(blockedAt).toBeLessThanOrEqual(100);
  });

  it('ne pénalise pas un autre /64', async () => {
    const response = await proxy(apiRequest('2001:db8:5:8::1'));
    expect(response.status).not.toBe(429);
  });
});
