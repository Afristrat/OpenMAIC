import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261112000000_revoke_anon_definer_functions.sql'),
  'utf8',
);

describe('revocation of anon access to SECURITY DEFINER functions', () => {
  it('removes anon (and, for server-only functions, authenticated) from the seven exposed functions', () => {
    for (const signature of [
      'create_widget_template(UUID, TEXT, TEXT, JSONB)',
      'revise_widget_template(UUID, UUID, TEXT, JSONB)',
      'publish_widget_template(UUID, UUID, UUID)',
      'settle_tenant_usage(UUID, UUID, NUMERIC)',
      'archive_courses_before_classroom_delete()',
    ]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`,
      );
    }
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.create_organization_with_admin(TEXT, TEXT, TEXT) FROM PUBLIC, anon;',
    );
    expect(sql).toContain('ALTER FUNCTION public.get_user_org_ids() SECURITY INVOKER;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC, anon;');
  });

  it('never grants anon and fails if any SECURITY DEFINER function stays executable by anon', () => {
    expect(sql).not.toMatch(/GRANT[^;]*\banon\b/);
    expect(sql).toContain("has_function_privilege('anon', p.oid, 'EXECUTE')");
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
