import { describe, expect, it } from 'vitest';
import { assertE2eModeIsLocal } from '@/lib/config/e2e-guard';

describe('assertE2eModeIsLocal', () => {
  it('laisse passer un build sans mode test', () => {
    expect(() =>
      assertE2eModeIsLocal({ NEXT_PUBLIC_SUPABASE_URL: 'https://db.qalem.ma' }),
    ).not.toThrow();
  });

  it('accepte le mode test contre le Supabase local des tests', () => {
    for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321']) {
      expect(() =>
        assertE2eModeIsLocal({ NEXT_PUBLIC_E2E_TEST_MODE: 'true', NEXT_PUBLIC_SUPABASE_URL: url }),
      ).not.toThrow();
    }
  });

  it('refuse le mode test contre un vrai Supabase ou sans adresse', () => {
    for (const url of ['https://db.qalem.ma', 'http://127.0.0.1.evil.example', undefined]) {
      expect(() =>
        assertE2eModeIsLocal({ NEXT_PUBLIC_E2E_TEST_MODE: 'true', NEXT_PUBLIC_SUPABASE_URL: url }),
      ).toThrow(/only allowed against a local Supabase/);
    }
  });
});
