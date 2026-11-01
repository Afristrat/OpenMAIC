import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameworkError } from '@/lib/referentiel/plan-framework';

const OCCUPATION = {
  uri: 'http://data.europa.eu/esco/occupation/o1',
  title_fr: 'développeur web',
  isco_code: '2513',
  referentiel_version: 'doc@2026-10-31',
  essential_uris: ['http://data.europa.eu/esco/skill/a', 'http://data.europa.eu/esco/skill/b'],
  optional_uris: ['http://data.europa.eu/esco/skill/c'],
};

const state = vi.hoisted(() => ({
  occupation: null as Record<string, unknown> | null,
  skills: [] as Array<{ uri: string; title_fr: string }>,
  linkCount: 0,
  upserts: [] as Array<{ rows: unknown; options: unknown }>,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => ({
      select: (_columns: string, options?: { count?: string }) => {
        if (table === 'referentiel_occupations') {
          return {
            eq: () => ({ maybeSingle: async () => ({ data: state.occupation, error: null }) }),
          };
        }
        if (table === 'referentiel_skills') {
          return { in: async () => ({ data: state.skills, error: null }) };
        }
        if (table === 'course_competencies' && options?.count) {
          return { eq: async () => ({ count: state.linkCount, error: null }) };
        }
        throw new Error(`table inattendue : ${table}`);
      },
      upsert: async (rows: unknown, options: unknown) => {
        state.upserts.push({ rows, options });
        return { error: null };
      },
    }),
  }),
}));

import {
  requireCompetencyFramework,
  resolveCompetencyFramework,
  saveCourseCompetencies,
} from '@/lib/server/plan-framework';

const REQUEST = {
  occupationUri: OCCUPATION.uri,
  skillUris: ['http://data.europa.eu/esco/skill/a', 'http://data.europa.eu/esco/skill/c'],
};

beforeEach(() => {
  state.occupation = { ...OCCUPATION };
  state.skills = [
    { uri: 'http://data.europa.eu/esco/skill/a', title_fr: 'concevoir une interface' },
    { uri: 'http://data.europa.eu/esco/skill/c', title_fr: 'documenter' },
  ];
  state.linkCount = 0;
  state.upserts = [];
});

describe('resolveCompetencyFramework', () => {
  it('rereads the occupation and its skills from the mirror, never from the client', async () => {
    const framework = await resolveCompetencyFramework(REQUEST);
    expect(framework.occupation).toEqual({
      uri: OCCUPATION.uri,
      titleFr: 'développeur web',
      isco08: '2513',
      referentialVersion: 'doc@2026-10-31',
    });
    expect(framework.skills).toEqual([
      {
        uri: 'http://data.europa.eu/esco/skill/a',
        title: 'concevoir une interface',
        nature: 'essentielle',
      },
      { uri: 'http://data.europa.eu/esco/skill/c', title: 'documenter', nature: 'optionnelle' },
    ]);
  });

  it('refuses an unknown occupation, an occupation without a base ISCO code and a foreign skill', async () => {
    state.occupation = null;
    await expect(resolveCompetencyFramework(REQUEST)).rejects.toMatchObject({
      code: 'COMPETENCY_FRAMEWORK_INVALID',
    });

    state.occupation = { ...OCCUPATION, isco_code: '25' };
    await expect(resolveCompetencyFramework(REQUEST)).rejects.toBeInstanceOf(FrameworkError);

    state.occupation = { ...OCCUPATION };
    await expect(
      resolveCompetencyFramework({
        ...REQUEST,
        skillUris: ['http://data.europa.eu/esco/skill/zzz'],
      }),
    ).rejects.toMatchObject({ code: 'COMPETENCY_FRAMEWORK_INVALID' });
  });
});

describe('requireCompetencyFramework', () => {
  it('requires a framework for a new course', async () => {
    await expect(requireCompetencyFramework({})).rejects.toMatchObject({
      code: 'COMPETENCY_FRAMEWORK_REQUIRED',
    });
  });

  it('requires a framework for an existing course that has no target skill yet', async () => {
    await expect(requireCompetencyFramework({ courseId: 'course-1' })).rejects.toMatchObject({
      code: 'COMPETENCY_FRAMEWORK_REQUIRED',
    });
  });

  it('lets an existing course that already carries target skills continue without a new choice', async () => {
    state.linkCount = 3;
    await expect(requireCompetencyFramework({ courseId: 'course-1' })).resolves.toBeNull();
  });

  it('verifies a supplied framework', async () => {
    const framework = await requireCompetencyFramework({ framework: REQUEST });
    expect(framework?.occupation.isco08).toBe('2513');
  });
});

describe('saveCourseCompetencies', () => {
  it('saves one link per target skill with the ISCO-08 code and the referential version', async () => {
    const framework = await resolveCompetencyFramework(REQUEST);
    await saveCourseCompetencies({
      courseId: 'course-1',
      orgId: 'org-1',
      userId: 'user-1',
      framework,
    });
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].options).toEqual({ onConflict: 'course_id,competency_uri' });
    expect(state.upserts[0].rows).toEqual([
      {
        course_id: 'course-1',
        org_id: 'org-1',
        competency_uri: 'http://data.europa.eu/esco/skill/a',
        referential_version: 'doc@2026-10-31',
        isco_08: '2513',
        nature: 'essentielle',
        created_by: 'user-1',
      },
      {
        course_id: 'course-1',
        org_id: 'org-1',
        competency_uri: 'http://data.europa.eu/esco/skill/c',
        referential_version: 'doc@2026-10-31',
        isco_08: '2513',
        nature: 'optionnelle',
        created_by: 'user-1',
      },
    ]);
  });
});
