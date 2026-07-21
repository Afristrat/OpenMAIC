import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  QALEM_CAPABILITIES,
  canUseForTask,
  createCapabilityRegistrySnapshot,
  createReferencedCertification,
  inferQalemCapabilities,
  reconcileLiteLLMReferences,
  recordCapabilityProbe,
  recordTaskValidation,
  setOperationalLimits,
  type CapabilityProbeResult,
  type ModelCertification,
} from '@/lib/ai/capability-registry';

const observation = {
  observedAt: '2026-07-21T20:00:00.000Z',
  evidenceRef: 'litellm-inventory:sha256:inventory-v1',
};

function referenced(modelId = 'kimi-k2.6'): ModelCertification {
  return createReferencedCertification(
    {
      model_name: modelId,
      litellm_params: { model: `moonshot/${modelId}` },
      model_info: { mode: 'chat', supports_reasoning: true, supports_vision: true },
    },
    observation,
  );
}

function probe(
  modelId: string,
  overrides: Partial<CapabilityProbeResult> = {},
): CapabilityProbeResult {
  return {
    modelId,
    capability: 'reasoning',
    outcome: 'passed',
    probedAt: '2026-07-21T20:05:00.000Z',
    evidenceRef: `probe:${modelId}:reasoning:v1`,
    latencyMs: 420,
    limitations: [],
    ...overrides,
  };
}

describe('capability registry', () => {
  it('keeps the portable schema aligned with runtime capabilities', () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'skills/qalem-prompt-compiler/references/capability-registry.schema.json',
        ),
        'utf8',
      ),
    ) as { $defs: { capability: { enum: string[] } } };

    expect(schema.$defs.capability.enum).toEqual(QALEM_CAPABILITIES);
  });

  it('treats ComfyUI image_generation as transport metadata, not a business capability', () => {
    expect(
      inferQalemCapabilities({
        model_name: 'unknown-workflow-name',
        litellm_params: { model: 'comfyui/unknown-workflow-name' },
        model_info: { mode: 'image_generation' },
      }),
    ).toEqual([]);
  });

  it('keeps LiteLLM claims advertised but not operational', () => {
    expect(referenced()).toMatchObject({
      status: 'referenced',
      advertisedCapabilities: ['chat', 'reasoning', 'vision'],
      capabilities: [],
      probes: [],
      validations: [],
    });
  });

  it('promotes only from a successful capability probe and task validation', () => {
    const reachable = recordCapabilityProbe(referenced(), probe('kimi-k2.6'));
    const validated = recordTaskValidation(reachable, {
      modelId: 'kimi-k2.6',
      taskId: 'outline',
      capability: 'reasoning',
      outcome: 'passed',
      evaluatedAt: '2026-07-21T20:10:00.000Z',
      evaluationRef: 'eval:outline:kimi-k2.6:v1',
      languageQuality: [{ locale: 'fr-FR', score: 0.91, evidenceRef: 'eval:language:fr-FR:v1' }],
      limitations: ['Structured output requires schema enforcement'],
    });

    expect(reachable).toMatchObject({
      status: 'reachable',
      capabilities: ['reasoning'],
      lastProbeAt: '2026-07-21T20:05:00.000Z',
    });
    expect(validated.status).toBe('validated');
    expect(canUseForTask(validated, 'reasoning', 'outline', 'fr-FR')).toBe(true);
    expect(canUseForTask(validated, 'reasoning', 'outline', 'ar-MA')).toBe(false);
    expect(canUseForTask(validated, 'reasoning', 'scene', 'fr-FR')).toBe(false);
  });

  it('invalidates operational use when a newer probe fails', () => {
    const reachable = recordCapabilityProbe(referenced(), probe('kimi-k2.6'));
    const validated = recordTaskValidation(reachable, {
      modelId: 'kimi-k2.6',
      taskId: 'outline',
      capability: 'reasoning',
      outcome: 'passed',
      evaluatedAt: '2026-07-21T20:10:00.000Z',
      evaluationRef: 'eval:outline:kimi-k2.6:v1',
      languageQuality: [],
      limitations: [],
    });
    const failed = recordCapabilityProbe(
      validated,
      probe('kimi-k2.6', {
        outcome: 'failed',
        probedAt: '2026-07-21T20:15:00.000Z',
        evidenceRef: 'probe:kimi-k2.6:reasoning:v2',
        limitations: ['Upstream timeout'],
      }),
    );

    expect(failed).toMatchObject({ status: 'failed', capabilities: [] });
    expect(failed.probes).toHaveLength(2);
    expect(canUseForTask(failed, 'reasoning', 'outline')).toBe(false);
  });

  it('keeps validation history while a newer failed evaluation blocks the task', () => {
    const reachable = recordCapabilityProbe(referenced(), probe('kimi-k2.6'));
    const passed = recordTaskValidation(reachable, {
      modelId: 'kimi-k2.6',
      taskId: 'outline',
      capability: 'reasoning',
      outcome: 'passed',
      evaluatedAt: '2026-07-21T20:10:00.000Z',
      evaluationRef: 'eval:outline:kimi-k2.6:v1',
      languageQuality: [],
      limitations: [],
    });
    const failed = recordTaskValidation(passed, {
      modelId: 'kimi-k2.6',
      taskId: 'outline',
      capability: 'reasoning',
      outcome: 'failed',
      evaluatedAt: '2026-07-21T20:20:00.000Z',
      evaluationRef: 'eval:outline:kimi-k2.6:v2',
      languageQuality: [],
      limitations: ['Output schema regression'],
    });

    expect(failed.status).toBe('reachable');
    expect(failed.validations).toHaveLength(2);
    expect(canUseForTask(failed, 'reasoning', 'outline')).toBe(false);
  });

  it('refuses task validation before reachability', () => {
    expect(() =>
      recordTaskValidation(referenced(), {
        modelId: 'kimi-k2.6',
        taskId: 'outline',
        capability: 'reasoning',
        outcome: 'passed',
        evaluatedAt: '2026-07-21T20:10:00.000Z',
        evaluationRef: 'eval:outline:kimi-k2.6:v1',
        languageQuality: [],
        limitations: [],
      }),
    ).toThrow('cannot be validated before its capability is reachable');
  });

  it('marks models absent from the latest LiteLLM inventory as failed without erasing evidence', () => {
    const current = recordCapabilityProbe(referenced(), probe('kimi-k2.6'));
    const reconciled = reconcileLiteLLMReferences([current], [], {
      observedAt: '2026-07-21T21:00:00.000Z',
      evidenceRef: 'litellm-inventory:sha256:inventory-v2',
    });

    expect(reconciled[0]).toMatchObject({
      modelId: 'kimi-k2.6',
      status: 'failed',
      reference: { active: false },
    });
    expect(reconciled[0].probes).toHaveLength(1);
  });

  it('requires a fresh probe when a missing model reappears', () => {
    const current = recordCapabilityProbe(referenced(), probe('kimi-k2.6'));
    const missing = reconcileLiteLLMReferences([current], [], {
      observedAt: '2026-07-21T21:00:00.000Z',
      evidenceRef: 'litellm-inventory:sha256:inventory-v2',
    });
    const restored = reconcileLiteLLMReferences(
      missing,
      [
        {
          model_name: 'kimi-k2.6',
          litellm_params: { model: 'moonshot/kimi-k2.6' },
          model_info: { mode: 'chat', supports_reasoning: true },
        },
      ],
      {
        observedAt: '2026-07-21T22:00:00.000Z',
        evidenceRef: 'litellm-inventory:sha256:inventory-v3',
      },
    );

    expect(restored[0]).toMatchObject({
      status: 'referenced',
      capabilities: [],
      reference: { active: true, activeSince: '2026-07-21T22:00:00.000Z' },
    });
    expect(restored[0].probes).toHaveLength(1);
  });

  it('records explicit operating limits and rejects fallback cycles in snapshots', () => {
    const primary = setOperationalLimits(referenced('primary'), {
      maxInputTokens: 131_072,
      maxOutputTokens: 16_384,
      maxConcurrency: 2,
      maxFileBytes: null,
      notes: ['Measured under the production proxy'],
      observedAt: '2026-07-21T20:20:00.000Z',
      evidenceRef: 'limits:production-proxy:v1',
    });
    const fallback = referenced('fallback');
    const cyclic = [
      { ...primary, fallbackModelId: 'fallback' },
      { ...fallback, fallbackModelId: 'primary' },
    ];

    expect(primary.limits.maxConcurrency).toBe(2);
    expect(() =>
      createCapabilityRegistrySnapshot(cyclic, '2026-07-21T21:10:00.000Z', 'inventory-v2'),
    ).toThrow('Fallback cycle detected');
  });
});
