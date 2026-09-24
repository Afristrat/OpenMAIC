import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260924220000_restore_learning_observation_contract.sql',
  ),
  'utf8',
);

describe('learning observation contract repair migration (S-035)', () => {
  it('accepts the final quiz-attempt and discussion fields', () => {
    expect(migration).toContain("'attempts'");
    expect(migration).toContain("'discussionMessages'");
    expect(migration).toMatch(/Quiz attempts do not match summary/);
    expect(migration).toMatch(/Invalid discussion count/);
  });

  it('does not overwrite the later consent-aware xAPI projection trigger', () => {
    expect(migration).not.toContain('project_course_xapi');
  });

  it('restores ownership of pseudonymous course and anchor exports', () => {
    expect(migration).toContain('learning_observation_id');
    expect(migration).toContain('anchor_session_id');
    expect(migration).toMatch(/Unexpected account export definition/);
  });

  it('keeps the collector callable only by the service role', () => {
    expect(migration).toMatch(/REVOKE ALL[\s\S]+FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/);
  });
});
