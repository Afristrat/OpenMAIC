import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00043_auth_profile_bootstrap.sql'),
  'utf8',
);

describe('auth profile bootstrap', () => {
  it('creates the required profile for every new auth identity', () => {
    expect(migration).toMatch(/AFTER INSERT ON auth\.users/i);
    expect(migration).toMatch(/INSERT INTO public\.profiles \(id\)\s+VALUES \(NEW\.id\)/i);
    expect(migration).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
  });

  it('backfills existing identities and locks down the trigger function', () => {
    expect(migration).toMatch(
      /INSERT INTO public\.profiles \(id\)\s+SELECT id FROM auth\.users/i,
    );
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_profile_for_auth_user\(\) FROM PUBLIC, anon, authenticated/i,
    );
  });
});
