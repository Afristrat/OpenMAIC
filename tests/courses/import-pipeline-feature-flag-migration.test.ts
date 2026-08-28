import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00046_import_pipeline_flag.sql'),
  'utf8',
);

describe('import pipeline feature flag migration', () => {
  it('provisions the gate disabled until legal retention prerequisites are approved', () => {
    expect(migration).toMatch(/'import_pipeline'/i);
    expect(migration).toMatch(/'import_pipeline',\s*false/i);
    expect(migration).not.toMatch(/enabled\s*=\s*EXCLUDED\.enabled/i);
  });
});
