import { expect, it, vi } from 'vitest';
import { readSessionReplayPage, replayCursor } from '@/lib/server/session-replay-page';
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
it('keeps exact bigint cursors and uses a bounded cancellable RPC', async () => {
  const abortSignal = vi
    .fn()
    .mockResolvedValue({ data: { events: [], nextCursor: null, upperBound: '9007199254741401' } });
  const rpc = vi.fn().mockReturnValue({ abortSignal });
  const db = { rpc } as unknown as Parameters<typeof readSessionReplayPage>[0];
  expect(
    await readSessionReplayPage(
      db,
      'session',
      new AbortController().signal,
      '9007199254741400',
      '9007199254741401',
    ),
  ).toMatchObject({ nextCursor: null });
  expect(rpc).toHaveBeenCalledWith('read_session_replay_page', {
    p_session: 'session',
    p_after: '9007199254741400',
    p_upper: '9007199254741401',
  });
  expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  abortSignal.mockResolvedValueOnce({ error: {} });
  await expect(
    readSessionReplayPage(db, 'session', new AbortController().signal),
  ).rejects.toThrow();
  abortSignal.mockResolvedValueOnce({ data: { events: [], nextCursor: '1', upperBound: '1' } });
  await expect(readSessionReplayPage(db, 'session', new AbortController().signal)).rejects.toThrow(
    'cursor',
  );
});
it.each(['-1', 'abc', '1.1', '1e2', '9223372036854775808', '01'])(
  'rejects invalid cursor %s without throwing from safeParse',
  (value) => {
    expect(replayCursor.safeParse(value).success).toBe(false);
  },
);
