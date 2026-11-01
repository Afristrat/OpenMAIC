import { describe, expect, it } from 'vitest';
import {
  COMPETENCY_EXTENSIONS,
  activityScope,
  confirmedCompetencies,
  deliveryPlan,
  withCompetency,
} from '@/lib/telemetry/competency-extensions';
import { trackQuizAttempted } from '@/lib/telemetry/xapi';
import { xapiDeliveryId } from '@/lib/telemetry/xapi-delivery';

const ORG = '00000000-0000-4000-8000-000000000071';
const SKILL_A = 'http://data.europa.eu/esco/skill/a';
const SKILL_B = 'http://data.europa.eu/esco/skill/b';
const VERSION = 'doc-1@2026-10-31';

const statement = trackQuizAttempted('user1', 'stageAbc', 'sceneXyz', 0.9);

type Result = { data: unknown; error: { message: string } | null };

/** Client Supabase minimal : chaque table rend le résultat configuré et enregistre les filtres. */
function fakeClient(results: Record<string, Result>) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        for (const op of ['select', 'eq', 'in', 'order']) {
          builder[op] = (...args: unknown[]) => {
            calls.push({ table, op, args });
            return builder;
          };
        }
        builder.maybeSingle = () => Promise.resolve(results[`${table}:single`]);
        builder.then = (resolve: (value: Result) => unknown) =>
          resolve(results[table] ?? { data: [], error: null });
        return builder;
      },
    } as unknown as Parameters<typeof confirmedCompetencies>[1],
  };
}

describe('activityScope', () => {
  it('reads the stage and the scene from the activity IRI, and nothing from a stage-level IRI', () => {
    expect(activityScope(statement)).toEqual({ stageId: 'stageAbc', sceneId: 'sceneXyz' });
    expect(
      activityScope({ ...statement, object: { id: 'https://qalem.app/stages/stageAbc' } }),
    ).toBeNull();
  });
});

describe('withCompetency', () => {
  it('adds the three Taqwim extensions and keeps the existing ones', () => {
    const base = {
      ...statement,
      context: {
        ...statement.context,
        extensions: { 'https://qalem.app/extensions/messageCount': 3 },
      },
    };

    const enriched = withCompetency(base, { uri: SKILL_A, version: VERSION, isco: '2513' });

    expect(enriched.context?.extensions).toEqual({
      'https://qalem.app/extensions/messageCount': 3,
      [COMPETENCY_EXTENSIONS.competence]: SKILL_A,
      [COMPETENCY_EXTENSIONS.version]: VERSION,
      [COMPETENCY_EXTENSIONS.isco]: '2513',
    });
    expect(enriched.context?.contextActivities).toEqual(statement.context?.contextActivities);
  });

  it('omits the ISCO extension when the course carries none', () => {
    const extensions = withCompetency(statement, { uri: SKILL_A, version: VERSION, isco: null })
      .context?.extensions;

    expect(extensions).toHaveProperty([COMPETENCY_EXTENSIONS.competence], SKILL_A);
    expect(extensions).not.toHaveProperty([COMPETENCY_EXTENSIONS.isco]);
  });
});

describe('deliveryPlan', () => {
  it('sends the original statement under the original identity when the scene has no confirmed link', () => {
    expect(deliveryPlan(statement, [], ORG, 'event-1')).toEqual([
      { statementId: xapiDeliveryId(ORG, 'event-1'), statement },
    ]);
  });

  it('sends one statement per confirmed competence with distinct, stable identities', () => {
    const links = [
      { uri: SKILL_A, version: VERSION, isco: '2513' },
      { uri: SKILL_B, version: VERSION, isco: null },
    ];

    const plan = deliveryPlan(statement, links, ORG, 'event-1');
    const again = deliveryPlan(statement, links, ORG, 'event-1');

    expect(plan).toHaveLength(2);
    expect(new Set(plan.map((item) => item.statementId)).size).toBe(2);
    expect(plan.map((item) => item.statementId)).toEqual(again.map((item) => item.statementId));
    expect(plan[0]?.statementId).not.toBe(xapiDeliveryId(ORG, 'event-1'));
    expect(plan[1]?.statement.context?.extensions?.[COMPETENCY_EXTENSIONS.competence]).toBe(
      SKILL_B,
    );
  });
});

describe('confirmedCompetencies', () => {
  it('returns nothing, without reading the database, for a statement that targets no scene', async () => {
    const { client, calls } = fakeClient({});

    const links = await confirmedCompetencies(
      { ...statement, object: { id: 'https://qalem.app/stages/stageAbc' } },
      client,
    );

    expect(links).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('keeps only confirmed links and adds the ISCO group carried by the course', async () => {
    const { client, calls } = fakeClient({
      scene_competencies: {
        data: [
          { competency_uri: SKILL_A, referential_version: VERSION },
          { competency_uri: SKILL_B, referential_version: VERSION },
        ],
        error: null,
      },
      'courses:single': { data: { id: 'course-1' }, error: null },
      course_competencies: { data: [{ competency_uri: SKILL_A, isco_08: '2513' }], error: null },
    });

    const links = await confirmedCompetencies(statement, client);

    expect(calls.filter((call) => call.table === 'scene_competencies' && call.op === 'eq')).toEqual(
      [
        { table: 'scene_competencies', op: 'eq', args: ['scene_id', 'sceneXyz'] },
        { table: 'scene_competencies', op: 'eq', args: ['statut', 'confirme'] },
      ],
    );
    expect(links).toEqual([
      { uri: SKILL_A, version: VERSION, isco: '2513' },
      { uri: SKILL_B, version: VERSION, isco: null },
    ]);
  });

  it('fails the delivery, so it is retried, when the database cannot be read', async () => {
    const { client } = fakeClient({
      scene_competencies: { data: null, error: { message: 'down' } },
    });

    await expect(confirmedCompetencies(statement, client)).rejects.toThrow('down');
  });
});
