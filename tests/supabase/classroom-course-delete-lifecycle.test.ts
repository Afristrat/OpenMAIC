import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const coursesMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00035_courses_and_imports.sql'),
  'utf8',
);
const lifecycleMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00039_multi_tenant_classroom_lifecycle.sql'),
  'utf8',
);
const sourceLifecycleMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00044_course_source_manifest_delete_lifecycle.sql'),
  'utf8',
);

describe('classroom and course deletion lifecycle', () => {
  it('bootstraps the organization and its first admin atomically from auth.uid()', () => {
    expect(lifecycleMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_organization_with_admin/i,
    );
    expect(lifecycleMigration).toMatch(/authenticated_user_id UUID := auth\.uid\(\)/i);
    expect(lifecycleMigration).toMatch(/INSERT INTO public\.organizations/i);
    expect(lifecycleMigration).toMatch(
      /INSERT INTO public\.org_members \(user_id, org_id, role\)/i,
    );
    expect(lifecycleMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_organization_with_admin\(TEXT, TEXT, TEXT\) TO authenticated/i,
    );
  });

  it('archives and unpublishes a ready course before its classroom link is cleared', () => {
    expect(coursesMigration).toMatch(
      /stage_id TEXT UNIQUE REFERENCES public\.stages\(id\) ON DELETE SET NULL/i,
    );
    expect(coursesMigration).toMatch(/status <> 'ready' OR stage_id IS NOT NULL/i);
    expect(lifecycleMigration).toMatch(/BEFORE DELETE ON public\.stages/i);
    expect(lifecycleMigration).toMatch(
      /UPDATE public\.courses\s+SET status = 'archived', catalog_visible = false\s+WHERE stage_id = OLD\.id AND status = 'ready'/i,
    );
  });

  it('clears the organization-specific source manifest during organization deletion', () => {
    expect(sourceLifecycleMigration).toMatch(/IF NEW\.org_id IS NULL THEN/i);
    expect(sourceLifecycleMigration).toMatch(/NEW\.source_manifest_id := NULL/i);
    expect(sourceLifecycleMigration).toMatch(
      /WHERE id = NEW\.source_manifest_id AND org_id = NEW\.org_id/i,
    );
  });

  it('executes the trigger with a locked-down search path and no public grant', () => {
    expect(lifecycleMigration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(lifecycleMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.archive_courses_before_classroom_delete\(\) FROM PUBLIC/i,
    );
  });
});
