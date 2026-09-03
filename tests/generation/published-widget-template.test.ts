import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneOutline } from '@/lib/types/generation';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';

const mocks = vi.hoisted(() => ({
  loadPublishedWidgetTemplate: vi.fn(),
}));

vi.mock('@/lib/server/published-widget-template', () => ({
  loadPublishedWidgetTemplate: mocks.loadPublishedWidgetTemplate,
}));

import { generateSceneContent } from '@/lib/generation/scene-generator';

const templateId = '00000000-0000-4000-8000-000000000059';
const versionId = '00000000-0000-4000-8000-000000000060';
const composition = {
  version: 1 as const,
  locale: 'en-US' as const,
  direction: 'ltr' as const,
  title: 'Margin calculator',
  inputs: [],
  computations: [
    { id: 'total', label: 'Total', expression: { op: 'literal' as const, value: 42 } },
  ],
  nodes: [{ id: 'result', type: 'computed_value' as const, computationId: 'total' }],
  rootNodeIds: ['result'],
  goldenCases: [{ name: 'reference case', inputs: {}, expected: { total: 42 } }],
};

function outline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-widget',
    type: 'plugin',
    title: 'Use the calculator',
    description: 'Practice margin calculation.',
    keyPoints: [],
    order: 1,
    pluginType: 'published-widget',
    widgetTemplateId: templateId,
    widgetTemplateVersionId: versionId,
    ...overrides,
  };
}

describe('published widget scene generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPublishedWidgetTemplate.mockResolvedValue({ templateId, versionId, composition });
  });

  it('pins the exact validated version without calling an LLM', async () => {
    const aiCall = vi.fn();

    await expect(generateSceneContent(outline(), aiCall)).resolves.toEqual({
      pluginType: 'published-widget',
      data: { templateId, versionId, composition },
    });
    expect(mocks.loadPublishedWidgetTemplate).toHaveBeenCalledWith(templateId, versionId);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it('fails closed when the pinned publication is unavailable', async () => {
    expectConsoleMessages({
      error: [
        '[ERROR] [Generation] Published widget selected for "Use the calculator" is unavailable',
      ],
    });
    mocks.loadPublishedWidgetTemplate.mockResolvedValue(null);

    await expect(generateSceneContent(outline(), vi.fn())).resolves.toBeNull();
  });

  it('fails closed when either pinned identifier is absent', async () => {
    expectConsoleMessages({
      error: [
        '[ERROR] [Generation] Published widget outline "Use the calculator" has no pinned template version',
      ],
    });
    await expect(
      generateSceneContent(outline({ widgetTemplateVersionId: undefined }), vi.fn()),
    ).resolves.toBeNull();
    expect(mocks.loadPublishedWidgetTemplate).not.toHaveBeenCalled();
  });
});
