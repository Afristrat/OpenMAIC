import { spawnSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('passes the build heap to Next and its workers while preserving options and failures', async () => {
  vi.stubEnv('NODE_OPTIONS', '--enable-source-maps --max-old-space-size=2048');
  vi.mocked(spawnSync).mockReturnValue({
    pid: 1,
    output: [],
    stdout: null,
    stderr: null,
    status: 7,
    signal: null,
  });
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('build exited');
  });

  await expect(import('../../scripts/build-next.mjs')).rejects.toThrow('build exited');

  expect(spawnSync).toHaveBeenCalledWith(
    process.execPath,
    [expect.stringContaining('next'), 'build', '--webpack'],
    expect.objectContaining({
      env: expect.objectContaining({
        NODE_OPTIONS: '--enable-source-maps --max-old-space-size=2048 --max-old-space-size=4096',
      }),
      stdio: 'inherit',
    }),
  );
  expect(process.env.NODE_OPTIONS).toBe('--enable-source-maps --max-old-space-size=2048');
  expect(exit).toHaveBeenCalledWith(7);
});
