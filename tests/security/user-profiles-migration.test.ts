import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00029_secure_user_profiles.sql'),
  'utf8',
);

describe('00029_secure_user_profiles', () => {
  it('isole les données de personnalisation avec RLS propriétaire seule', () => {
    expect(migration).toContain('CREATE TABLE public.user_profiles');
    expect(migration).toContain('ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY "user_profiles_select_own"');
    expect(migration).toContain('USING (auth.uid() = user_id)');
    expect(migration).toContain('CREATE POLICY "user_profiles_insert_own"');
    expect(migration).toContain('WITH CHECK (auth.uid() = user_id)');
    expect(migration).toContain('CREATE POLICY "user_profiles_update_own"');
    expect(migration).not.toContain('org_members');
  });

  it('migre puis efface les données privées de profiles', () => {
    expect(migration).toContain('INSERT INTO public.user_profiles');
    expect(migration).toContain('SELECT id, culture, ui_language, preferences, updated_at');
    expect(migration).toContain('UPDATE public.profiles');
    expect(migration).toContain("culture = 'ma-fr'");
    expect(migration).toContain("ui_language = 'fr-FR'");
    expect(migration).toContain("preferences = '{}'::jsonb");
  });
});
