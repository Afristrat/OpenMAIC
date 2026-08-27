import { describe, expect, it } from 'vitest';
import { buildSceneExtra } from '@/lib/server/classroom-storage';
import type { Scene } from '@/lib/types/stage';

describe('classroom source grounding persistence', () => {
  it('keeps passage identifiers, versions and issues in the scene JSONB extra', () => {
    const sourceGrounding = {
      schemaVersion: 1 as const,
      status: 'contradictory' as const,
      passages: [
        {
          id: 'policy:v3:p2',
          sourceId: 'policy',
          sourceVersion: 'v3',
          sourceTitle: 'policy.pdf',
          text: 'Le seuil est de 45 %.',
          start: 120,
          end: 142,
        },
      ],
      issues: [
        {
          type: 'contradictory' as const,
          message: 'Deux valeurs incompatibles.',
          passageIds: ['policy:v2:p2', 'policy:v3:p2'],
        },
      ],
    };
    const scene = {
      id: 'scene-1',
      stageId: 'stage-1',
      type: 'slide',
      title: 'Seuil',
      order: 0,
      content: { type: 'slide', canvas: { id: 'canvas', elements: [] } },
      sourceGrounding,
    } as unknown as Scene;

    const roundTrip = JSON.parse(JSON.stringify(buildSceneExtra(scene)));
    expect(roundTrip.sourceGrounding).toEqual(sourceGrounding);
  });
});
