import { describe, expect, it } from 'vitest';

import {
  canUseForTask,
  createReferencedCertification,
  inferQalemCapabilities,
  type ModelCertification,
} from '@/lib/ai/capability-registry';

describe('capability registry', () => {
  it.each([
    ['ltx-2-video', 'video-generation'],
    ['ace-step-audio', 'music-generation'],
    ['flux-kontext-edit', 'image-editing'],
    ['z-image-turbo', 'image-generation'],
  ] as const)('maps ComfyUI workflow %s to its business capability', (modelId, capability) => {
    expect(
      inferQalemCapabilities({
        model_name: modelId,
        litellm_params: { model: `comfyui/${modelId}` },
        model_info: { mode: 'image_generation' },
      }),
    ).toEqual([capability]);
  });

  it('does not treat a LiteLLM reference as operational', () => {
    expect(
      createReferencedCertification({
        model_name: 'kimi-k2.6',
        litellm_params: { model: 'moonshot/kimi-k2.6' },
        model_info: { mode: 'chat', supports_reasoning: true, supports_vision: true },
      }),
    ).toMatchObject({
      status: 'referenced',
      capabilities: ['chat', 'reasoning', 'vision'],
      validatedTasks: [],
    });
  });

  it('requires task-level validation before use', () => {
    const certification: ModelCertification = {
      modelId: 'deepseek-v4-pro',
      transportModel: 'deepseek/deepseek-v4-pro',
      transportMode: 'chat',
      capabilities: ['chat', 'reasoning'],
      status: 'validated',
      lastProbeAt: '2026-07-18T00:00:00.000Z',
      validatedTasks: ['outline'],
      limitations: [],
      fallbackModelId: null,
    };

    expect(canUseForTask(certification, 'reasoning', 'outline')).toBe(true);
    expect(canUseForTask(certification, 'reasoning', 'scene')).toBe(false);
  });
});
