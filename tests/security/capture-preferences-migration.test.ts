import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261029120000_capture_preferences.sql'),
  'utf8',
);

describe('20261029120000_capture_preferences', () => {
  it('active la sécurité par ligne et réserve toute écriture au service', () => {
    expect(migration).toContain('ALTER TABLE public.capture_preferences ENABLE ROW LEVEL SECURITY');
    for (const verb of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(migration).toMatch(
        new RegExp(
          String.raw`ON public\.capture_preferences FOR ${verb} (WITH CHECK|USING) \(false\)`,
        ),
      );
    }
  });

  it('limite la lecture au propriétaire, sans lecture publique', () => {
    expect(migration).toContain('FOR SELECT USING (owner_id = auth.uid())');
    expect(migration).not.toMatch(/USING\s*\(true\)/i);
  });

  it('borne le mode et ne stocke aucune organisation ni aucun secret', () => {
    expect(migration).toContain("capture_mode IN ('simple', 'ai')");
    expect(migration).not.toMatch(/org_id|api_key|token/i);
  });
});
