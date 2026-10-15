import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns', () => ({ promises: { lookup: mocks.lookup } }));

import { validateUrlForSSRF, isPrivateIP } from './ssrf-guard.js';

const BLOCK = 'Local/private network URLs are not allowed';

describe('validateUrlForSSRF (capture-worker port)', () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
    delete process.env.ALLOW_LOCAL_NETWORKS;
  });

  it('blocks private-network URLs', async () => {
    const result = await validateUrlForSSRF('http://127.0.0.1:8090/admin');
    expect(result).not.toBeNull();
  });

  it('blocks non-http(s) protocols', async () => {
    const result = await validateUrlForSSRF('file:///etc/passwd');
    expect(result).toBe('Only HTTP(S) URLs are allowed');
  });

  it('allows a public IP URL', async () => {
    const result = await validateUrlForSSRF('https://1.1.1.1/');
    expect(result).toBeNull();
  });

  it('rejects an invalid URL', async () => {
    expect(await validateUrlForSSRF('not a url')).toBe('Invalid URL');
  });

  it.each([
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://0177.0.0.1/',
    'http://127.1/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://240.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.localhost/',
    'http://LOCALHOST./',
  ])('blocks %s without any DNS lookup', async (url) => {
    expect(await validateUrlForSSRF(url)).toContain(BLOCK);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('blocks a hostname resolving to a newly covered range, NAT64 or IPv4-mapped loopback', async () => {
    mocks.lookup.mockResolvedValue([{ address: '100.100.1.1', family: 4 }]);
    expect(await validateUrlForSSRF('https://tailnet.example/')).toContain(BLOCK);
    mocks.lookup.mockResolvedValue([{ address: '64:ff9b::7f00:1', family: 6 }]);
    expect(await validateUrlForSSRF('https://a.example/')).toContain(BLOCK);
    mocks.lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
    expect(await validateUrlForSSRF('https://b.example/')).toContain(BLOCK);
  });

  it('blocks when any resolved address is private (mixed answer)', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.0.0.8', family: 4 },
    ]);
    expect(await validateUrlForSSRF('https://mixed.example/')).toContain(BLOCK);
  });

  it('allows a hostname resolving only to public addresses', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect(await validateUrlForSSRF('https://example.com/')).toBeNull();
  });

  it('fails closed when the hostname cannot be resolved', async () => {
    mocks.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await validateUrlForSSRF('https://nope.example/')).toBe(
      'Unable to verify hostname safety',
    );
  });

  it('honours the explicit ALLOW_LOCAL_NETWORKS opt-out', async () => {
    process.env.ALLOW_LOCAL_NETWORKS = 'true';
    expect(await validateUrlForSSRF('http://127.0.0.1:8090/')).toBeNull();
  });
});

describe('isPrivateIP (capture-worker port)', () => {
  it('flags 10.x.x.x as private', () => {
    expect(isPrivateIP('10.0.0.5')).toBe(true);
  });

  it('does not flag a public IP as private', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
  });

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '100.64.0.1',
    '100.127.255.254',
    '192.0.0.8',
    '192.0.2.1',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '::ffff:100.64.0.1',
    '::7f00:1',
    '::ffff:0:7f00:1',
    '64:ff9b::',
    '64:ff9b::7f00:1',
    '64:ff9b:1::1',
    '2002:7f00:0001::',
    '2130706433',
    '0x7f.1',
    '0177.0.0.1',
    '127.1',
    '[::1]',
    '1:2:3:4:5:6:7:8:9',
    '::g',
  ])('treats %s as private', (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '192.0.1.1',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2002:0808:0808::',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    'api.openai.com',
  ])('treats %s as public', (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });
});
