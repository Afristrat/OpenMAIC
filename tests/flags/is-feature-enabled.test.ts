import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isFeatureEnabled, type FlagReader } from '@/lib/flags';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => mocks.maybeSingle(table, columns, column, value),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('isFeatureEnabled — injected reader (unit)', () => {
  it('returns true when the flag is enabled', async () => {
    const reader: FlagReader = vi.fn().mockResolvedValue(true);
    await expect(isFeatureEnabled('skill_engine', reader)).resolves.toBe(true);
    expect(reader).toHaveBeenCalledWith('skill_engine');
  });

  it('returns false when the flag is explicitly disabled', async () => {
    const reader: FlagReader = vi.fn().mockResolvedValue(false);
    await expect(isFeatureEnabled('skill_engine', reader)).resolves.toBe(false);
  });

  it('fails closed (false) when the flag row does not exist', async () => {
    const reader: FlagReader = vi.fn().mockResolvedValue(null);
    await expect(isFeatureEnabled('unknown_flag', reader)).resolves.toBe(false);
  });
});

describe('isFeatureEnabled — default reader (Supabase service client)', () => {
  beforeEach(() => {
    mocks.maybeSingle.mockReset();
  });

  it('queries feature_flags by flag_name and returns the enabled column', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { enabled: true }, error: null });

    await expect(isFeatureEnabled('video_capsules')).resolves.toBe(true);

    expect(mocks.maybeSingle).toHaveBeenCalledWith(
      'feature_flags',
      'enabled',
      'flag_name',
      'video_capsules',
    );
  });

  it('returns false for a disabled flag', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { enabled: false }, error: null });

    await expect(isFeatureEnabled('video_capsules')).resolves.toBe(false);
  });

  it('fails closed when Supabase returns an error', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    await expect(isFeatureEnabled('video_capsules')).resolves.toBe(false);
  });

  it('fails closed when the row does not exist (maybeSingle returns null data)', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(isFeatureEnabled('never_created_flag')).resolves.toBe(false);
  });
});
