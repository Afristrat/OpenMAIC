import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestLtiEndpoint } from '@/lib/lti/network';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), lookup: vi.fn(), destroyed: vi.fn(),
  options: undefined as import('undici').Agent.Options | undefined,
}));
vi.mock('node:dns', () => ({ promises: { lookup: mocks.lookup } }));
vi.mock('undici', async (original) => {
  const actual = await original<typeof import('undici')>();
  return { ...actual, fetch: mocks.fetch, Agent: class {
    constructor(options: import('undici').Agent.Options) { mocks.options = options; }
    async destroy() { mocks.destroyed(); }
  } };
});
describe('LTI pinned public HTTPS transport', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.options = undefined;
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockResolvedValue(Response.json({ keys: [] }));
    vi.stubEnv('ALLOW_LOCAL_NETWORKS', 'true');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it.each([
    'http://lms.example/key', 'https://u:p@lms.example/key', 'https://lms.example/key#hash',
    'https://localhost/key', 'https://127.0.0.1/key', 'https://10.0.0.1/key',
    'https://100.64.0.1/key', 'https://169.254.169.254/key', 'https://224.0.0.1/key',
    'https://[::1]/key', 'https://[::ffff:127.0.0.1]/key', 'https://[64:ff9b::a00:1]/key',
    'https://[2002:0a00:0001::]/key', 'https://[2001:db8::1]/key',
  ])('rejects %s before transmitting despite global LAN opt-in', async (url) => {
    await expect(requestLtiEndpoint(url, { method: 'GET' }, 100)).rejects.toThrow('LTI endpoint');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects a mixed public/private DNS answer instead of selecting its safe entry', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.2', family: 4 }]);
    await expect(requestLtiEndpoint('https://lms.example/key', { method: 'GET' }, 100)).rejects.toThrow('LTI endpoint');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('pins the socket lookup to the verified answer, preserving hostname and TLS validation', async () => {
    await requestLtiEndpoint('https://lms.example/key', { method: 'GET' }, 100);
    const connect = mocks.options?.connect;
    if (!connect || typeof connect !== 'object' || !('lookup' in connect) || !connect.lookup) throw new Error('Missing pinned lookup');
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const callback = vi.fn();
    connect.lookup('lms.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect('rejectUnauthorized' in connect && connect.rejectUnauthorized).toBe(true);
    expect(String(mocks.fetch.mock.calls[0][0])).toBe('https://lms.example/key');
    expect(mocks.fetch.mock.calls[0][1].redirect).toBe('manual');
    expect(mocks.destroyed).toHaveBeenCalledOnce();
  });
  it.each([302, 307])('refuses redirect %s without following or forwarding credentials', async (status) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status, headers: { Location: 'https://127.0.0.1/private' } }));
    await expect(requestLtiEndpoint('https://lms.example/token', { method: 'POST', body: 'fixture' }, 100)).rejects.toThrow('LTI endpoint');
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.destroyed).toHaveBeenCalledOnce();
  });
  it('bounds actual decoded bytes regardless of claimed content length and closes the agent', async () => {
    mocks.fetch.mockResolvedValue(new Response('x'.repeat(101), { headers: { 'Content-Length': '1' } }));
    await expect(requestLtiEndpoint('https://lms.example/key', { method: 'GET' }, 100)).rejects.toThrow('LTI endpoint');
    expect(mocks.destroyed).toHaveBeenCalledOnce();
  });
  it('times out a stalled DNS lookup before allocating a dispatcher', async () => {
    vi.useFakeTimers(); mocks.lookup.mockImplementation(() => new Promise(() => {}));
    const result = expect(requestLtiEndpoint('https://lms.example/key', { method: 'GET' }, 100)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15001); await result;
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.options).toBeUndefined();
  });
});
