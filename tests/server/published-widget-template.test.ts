import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  templateSingle: vi.fn(),
  versionSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

import { loadPublishedWidgetTemplate } from '@/lib/server/published-widget-template';

const templateId = '00000000-0000-4000-8000-000000000059';
const versionId = '00000000-0000-4000-8000-000000000060';
const composition = {
  version: 1,
  locale: 'fr-FR',
  direction: 'ltr',
  title: 'Calcul simple',
  inputs: [],
  computations: [{ id: 'total', label: 'Total', expression: { op: 'literal', value: 42 } }],
  nodes: [{ id: 'result', type: 'computed_value', computationId: 'total' }],
  rootNodeIds: ['result'],
  goldenCases: [{ name: 'cas nominal', inputs: {}, expected: { total: 42 } }],
};

describe('loadPublishedWidgetTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.templateSingle.mockResolvedValue({
      data: { published_version_id: versionId },
      error: null,
    });
    mocks.versionSingle.mockResolvedValue({ data: { composition }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'widget_templates') {
        return {
          select: () => ({ eq: () => ({ single: mocks.templateSingle }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ not: () => ({ single: mocks.versionSingle }) }),
          }),
        }),
      };
    });
  });

  it('loads and validates the exact published immutable version', async () => {
    await expect(loadPublishedWidgetTemplate(templateId, versionId)).resolves.toEqual({
      templateId,
      versionId,
      composition,
    });
  });

  it('rejects a version that is no longer the template publication', async () => {
    mocks.templateSingle.mockResolvedValue({
      data: { published_version_id: '00000000-0000-4000-8000-000000000061' },
      error: null,
    });

    await expect(loadPublishedWidgetTemplate(templateId, versionId)).resolves.toBeNull();
    expect(mocks.versionSingle).not.toHaveBeenCalled();
  });

  it('rejects corrupted composition at the server trust boundary', async () => {
    mocks.versionSingle.mockResolvedValue({
      data: { composition: { ...composition, nodes: [{ id: 'x', type: 'script' }] } },
      error: null,
    });

    await expect(loadPublishedWidgetTemplate(templateId, versionId)).resolves.toBeNull();
  });

  it('rejects malformed identifiers before opening the service-role client', async () => {
    await expect(loadPublishedWidgetTemplate('../template', versionId)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
