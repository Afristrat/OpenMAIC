import { afterEach, expect, it, vi } from 'vitest';
import { authorizeXapiDelivery, xapiDeliveryId } from '@/lib/telemetry/xapi-delivery';
const database = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: database.rpc }),
}));
import { sendStatement, VERBS, type XAPIStatement } from '@/lib/telemetry/xapi';
import { getXAPIConfig } from '@/lib/telemetry/config';
const statement: XAPIStatement = {
  actor: { mbox: 'mailto:opaque@qalem.invalid', objectType: 'Agent' },
  verb: VERBS.completed,
  object: { id: 'https://qalem.ma/course' },
  timestamp: '2026-09-10T00:00:00.000Z',
};
const config = { endpoint: 'https://lrs.example/xapi/', auth: 'synthetic', enabled: true };
it('requires an exact fresh authorization and does not treat a storage failure as permission', async () => {
  database.rpc.mockReturnValue({ abortSignal: database.abort });
  for (const value of [false, null, 'true', {}]) {
    database.abort.mockResolvedValue({ data: value, error: null });
    expect(await authorizeXapiDelivery(12)).toBe(false);
  }
  database.abort.mockResolvedValue({ data: true, error: null });
  expect(await authorizeXapiDelivery(12)).toBe(true);
  expect(database.rpc).toHaveBeenCalledWith('authorize_xapi_delivery', { p_id: 12 });
  database.abort.mockResolvedValue({ data: true, error: { message: 'private' } });
  await expect(authorizeXapiDelivery(12)).rejects.toThrow(
    'xAPI delivery authorization unavailable',
  );
  await expect(authorizeXapiDelivery(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(
    'Invalid xAPI outbox identity',
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('isolates tenants and event keys, including ambiguous concatenations', () => {
  const id = xapiDeliveryId('tenant', 'event');
  expect(id).toMatch(/^[\da-f-]{14}5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  expect(id).toBe(xapiDeliveryId('tenant', 'event'));
  expect(id).not.toBe(xapiDeliveryId('other', 'event'));
  expect(xapiDeliveryId('a:b', 'c')).not.toBe(xapiDeliveryId('a', 'b:c'));
});
const guard = vi.hoisted(() => ({ safeFetch: vi.fn(), dispose: vi.fn() }));
vi.mock('@/lib/server/ssrf-guard', () => ({ safeFetch: guard.safeFetch }));
function delivered(status: number) {
  guard.dispose.mockResolvedValue(undefined);
  return { response: new Response(null, { status }), finalUrl: '', dispose: guard.dispose };
}
it('retries with the same identity and payload, requiring native acknowledgement', async () => {
  guard.safeFetch.mockReset().mockImplementation(async () => delivered(204));
  const nativeFetch = vi.fn();
  vi.stubGlobal('fetch', nativeFetch);
  const id = xapiDeliveryId('tenant', 'event');
  expect(await sendStatement(statement, config, id)).toBe(true);
  expect(await sendStatement(statement, config, id)).toBe(true);
  // Envoi par safeFetch (connexion épinglée, anti DNS rebinding), jamais par le fetch natif
  expect(nativeFetch).not.toHaveBeenCalled();
  expect(guard.dispose).toHaveBeenCalledTimes(2);
  const calls = guard.safeFetch.mock.calls;
  expect(String(calls[0][0])).toBe(`https://lrs.example/xapi/statements?statementId=${id}`);
  expect(calls[0][1]).toMatchObject({ method: 'PUT', signal: expect.any(AbortSignal) });
  // Aucune redirection suivie : un 3xx vers une cible interne ne doit pas être rejoué
  expect(calls[0][2]).toMatchObject({ maxRedirects: 0 });
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(JSON.parse(calls[0][1].body).id).toBe(id);
  for (const status of [200, 202, 301, 409, 500]) {
    guard.safeFetch.mockResolvedValueOnce(delivered(status));
    expect(await sendStatement(statement, config, id)).toBe(false);
  }
  guard.safeFetch.mockRejectedValueOnce(new Error('network'));
  expect(await sendStatement(statement, config, id)).toBe(false);
});
it('never sends to a destination refused by the SSRF guard', async () => {
  guard.safeFetch
    .mockReset()
    .mockRejectedValue(new Error('Local/private network URLs are not allowed'));
  const id = xapiDeliveryId('tenant', 'event');
  expect(await sendStatement(statement, { ...config, endpoint: 'https://10.0.0.5/xapi' }, id)).toBe(
    false,
  );
  expect(guard.safeFetch).toHaveBeenCalledTimes(1);
});
it('refuses disabled sending, invalid identities, and credential-bearing or insecure URLs', async () => {
  guard.safeFetch.mockReset();
  const id = xapiDeliveryId('tenant', 'event');
  expect(await sendStatement(statement, { ...config, enabled: false }, id)).toBe(false);
  expect(await sendStatement(statement, config, 'invalid')).toBe(false);
  for (const endpoint of [
    'http://lrs.example',
    'https://user:pass@lrs.example',
    'https://lrs.example?token=secret',
  ])
    expect(await sendStatement(statement, { ...config, endpoint }, id)).toBe(false);
  expect(guard.safeFetch).not.toHaveBeenCalled();
});
it('requires explicit opt-in for the global LRS configuration', () => {
  vi.stubEnv('XAPI_ENDPOINT', config.endpoint);
  vi.stubEnv('XAPI_AUTH', config.auth);
  for (const enabled of ['', 'false', 'yes']) {
    vi.stubEnv('XAPI_ENABLED', enabled);
    expect(getXAPIConfig()?.enabled).toBe(false);
  }
  vi.stubEnv('XAPI_ENABLED', 'true');
  expect(getXAPIConfig()?.enabled).toBe(true);
});
