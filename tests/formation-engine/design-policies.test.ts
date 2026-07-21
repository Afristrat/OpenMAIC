import { describe, expect, it } from 'vitest';

import {
  resolveDesignPolicies,
  type DesignPolicyOption,
} from '@/lib/formation-engine/design-policies';
import { compileGenerationPlan } from '@/lib/formation-engine/prompt-compiler';

const context = {
  competencyType: 'procedural' as const,
  audienceLevel: 'novice' as const,
  riskLevel: 'high' as const,
  deliveryMode: 'workplace' as const,
};

function option(overrides: Partial<DesignPolicyOption> = {}): DesignPolicyOption {
  return {
    id: 'evidence-backed-practice-range',
    metric: 'practice-share',
    range: { min: 55, max: 80, unit: 'percent' },
    conditions: { competencyTypes: ['procedural'], riskLevels: ['high'] },
    rationale: 'La compétence doit être démontrée dans ses conditions d’exercice.',
    trigger: 'Compétence procédurale à risque élevé.',
    measurement: 'Durée observée des activités de performance divisée par la durée totale.',
    evidenceRefs: ['golden-set:procedural-transfer-v1'],
    ...overrides,
  };
}

describe('conditional and traceable design policies', () => {
  it('leaves every metric unconstrained when no evidence-backed policy applies', () => {
    const result = resolveDesignPolicies(context, []);

    expect(result.status).toBe('ready');
    expect(Object.values(result.metrics).every((metric) => metric.status === 'unconstrained')).toBe(
      true,
    );
  });

  it('selects only policies whose structured conditions match the context', () => {
    const result = resolveDesignPolicies(context, [
      option(),
      option({
        id: 'expert-only',
        conditions: { audienceLevels: ['expert'] },
        range: { min: 10, max: 20, unit: 'percent' },
      }),
    ]);

    expect(result.metrics['practice-share']).toMatchObject({
      status: 'recommended',
      optionIds: ['evidence-backed-practice-range'],
      range: { min: 55, max: 80, unit: 'percent' },
    });
    expect(result.metrics['practice-share']).toMatchObject({
      traceability: [
        {
          id: 'evidence-backed-practice-range',
          evidenceRefs: ['golden-set:procedural-transfer-v1'],
        },
      ],
    });
  });

  it('intersects compatible ranges instead of choosing one silently', () => {
    const result = resolveDesignPolicies(context, [
      option(),
      option({ id: 'workplace-constraint', range: { min: 65, max: 90, unit: 'percent' } }),
    ]);

    expect(result.metrics['practice-share']).toMatchObject({
      status: 'recommended',
      range: { min: 65, max: 80, unit: 'percent' },
    });
  });

  it('surfaces incompatible ranges and blocks prompt compilation', () => {
    const policies = resolveDesignPolicies(context, [
      option({ range: { min: 20, max: 30, unit: 'percent' } }),
      option({ id: 'conflicting-policy', range: { min: 60, max: 70, unit: 'percent' } }),
    ]);
    const plan = compileGenerationPlan({
      contract: {},
      tasks: [],
      certifications: [],
      designPolicies: policies,
    });

    expect(policies.status).toBe('conflict');
    expect(plan.status).toBe('needs_input');
    expect(plan.blockingQuestions).toHaveLength(1);
    expect(plan.contract.designPolicies).toEqual(policies);
  });

  it('rejects theory and practice minimums that cannot fit in the same design', () => {
    const result = resolveDesignPolicies(context, [
      option({ id: 'practice', range: { min: 70, max: 80, unit: 'percent' } }),
      option({
        id: 'theory',
        metric: 'theory-share',
        range: { min: 40, max: 50, unit: 'percent' },
      }),
    ]);

    expect(result.status).toBe('conflict');
    expect(result.metrics['theory-share']).toMatchObject({ status: 'conflict' });
    expect(result.metrics['practice-share']).toMatchObject({ status: 'conflict' });
  });

  it('rejects a unit that does not measure the declared metric', () => {
    expect(() =>
      resolveDesignPolicies(context, [
        option({ metric: 'new-concepts-per-block', range: { min: 1, max: 3, unit: 'percent' } }),
      ]),
    ).toThrow('uses an invalid unit');
  });

  it('rejects a numeric heuristic without rationale, trigger, measure and evidence', () => {
    expect(() =>
      resolveDesignPolicies(context, [
        option({ rationale: '', trigger: '', measurement: '', evidenceRefs: [] }),
      ]),
    ).toThrow('is not traceable');
  });
});
