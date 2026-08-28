import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/00045_enable_course_catalog.sql',
);

describe('00045 course catalog feature flag migration', () => {
  it('active durablement le flag global du catalogue', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/INSERT INTO public\.feature_flags/i);
    expect(sql).toMatch(/'course_catalog'/i);
    expect(sql).toMatch(/true/i);
    expect(sql).toMatch(/ON CONFLICT \(flag_name\)[\s\S]*DO UPDATE/i);
    expect(sql).toMatch(/enabled\s*=\s*EXCLUDED\.enabled/i);
  });
});
