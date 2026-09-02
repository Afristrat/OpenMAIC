import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/00058_secure_certificate_visibility.sql',
);

describe('00058_secure_certificate_visibility', () => {
  it('retire la lecture publique globale sans supprimer la politique propriétaire', () => {
    expect(existsSync(migrationPath), 'la migration de sécurité doit exister').toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Public verification lookup" ON public.certificates',
    );
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*USING\s*\(true\)/i);
  });
});
