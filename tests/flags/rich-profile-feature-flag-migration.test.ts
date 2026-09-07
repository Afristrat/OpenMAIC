import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/00071_enable_rich_profile.sql');

describe('00071 rich profile feature flag migration', () => {
  it('active durablement le profil enrichi après le checkpoint humain', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/INSERT INTO public\.feature_flags/i);
    expect(sql).toMatch(/'rich_profile'/i);
    expect(sql).toMatch(/true/i);
    expect(sql).toMatch(/ON CONFLICT \(flag_name\)[\s\S]*DO UPDATE/i);
    expect(sql).toMatch(/enabled\s*=\s*EXCLUDED\.enabled/i);
  });
});
