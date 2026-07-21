import { describe, expect, it, vi } from 'vitest';
import { PermitPool } from '@/lib/jobs/permit-pool';

describe('PermitPool', () => {
  it('never exceeds its configured concurrency', async () => {
    const pool = new PermitPool(1);
    let active = 0;
    let maximumActive = 0;
    let releaseFirst!: () => void;

    const first = pool.run(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releaseFirst = () => {
            active -= 1;
            resolve();
          };
        }),
    );
    await vi.waitFor(() => expect(active).toBe(1));

    const second = pool.run(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      active -= 1;
    });
    await Promise.resolve();
    expect(active).toBe(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(maximumActive).toBe(1);
  });
});
