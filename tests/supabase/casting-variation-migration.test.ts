import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/00030_casting_variation.sql');

describe('00030 casting variation migration', () => {
  it('enforces variation in SQL and keeps writes service-only', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toMatch(/CREATE TABLE public\.castings/i);
    expect(sql).toMatch(/UNIQUE \(user_id, course_id, lineup_hash\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.castings ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/castings_insert_service_only[\s\S]*WITH CHECK \(false\)/i);
  });
});
