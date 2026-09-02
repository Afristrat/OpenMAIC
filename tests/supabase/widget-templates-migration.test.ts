import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00059_widget_templates.sql'),
  'utf8',
);

describe('widget template persistence migration (S6-027)', () => {
  it('persists global templates, immutable versions and publication audits', () => {
    expect(migration).toMatch(/CREATE TABLE public\.widget_templates/i);
    expect(migration).toMatch(/CREATE TABLE public\.widget_template_versions/i);
    expect(migration).toMatch(/CREATE TABLE public\.widget_template_publications/i);
    expect(migration).toMatch(/UNIQUE\s*\(template_id, version_number\)/i);
    expect(migration).toMatch(/prevent_widget_template_version_mutation/i);
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.widget_template_versions/i);
  });

  it('allows authenticated users to read only published templates and versions', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY[\s\S]+widget_templates/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY[\s\S]+widget_template_versions/i);
    expect(migration).toMatch(/FOR SELECT[\s\S]+TO authenticated[\s\S]+published_version_id IS NOT NULL/i);
    expect(migration).toMatch(/FOR SELECT[\s\S]+TO authenticated[\s\S]+published_at IS NOT NULL/i);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE[\s\S]+FROM authenticated/i);
    expect(migration).not.toMatch(/FOR (?:INSERT|UPDATE|DELETE|ALL)[\s\S]+TO authenticated/i);
  });

  it('exposes audited service-only functions for creation, revision and publication', () => {
    for (const functionName of [
      'create_widget_template',
      'revise_widget_template',
      'publish_widget_template',
    ]) {
      expect(migration).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}`, 'i'));
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]+TO service_role`, 'i'),
      );
    }
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC/i);
  });
});
