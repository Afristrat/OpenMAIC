import { describe, expect, test } from 'vitest';
import { buildLectureRows } from '@/components/chat/lecture-notes-view';

describe('prepared interventions in lecture notes', () => {
  test('keeps the agent and stable intervention identity on the selectable row', () => {
    expect(
      buildLectureRows([
        { kind: 'action', type: 'spotlight' },
        {
          kind: 'speech',
          text: 'Quel fait invaliderait cette hypothèse ?',
          agentId: 'analyst',
          agentName: 'Nadia',
          interventionId: 'scene-1-blind-spot',
          interventionForm: 'blind-spot',
        },
      ]),
    ).toEqual([
      {
        kind: 'speech',
        inlineActions: ['spotlight'],
        text: 'Quel fait invaliderait cette hypothèse ?',
        agentId: 'analyst',
        agentName: 'Nadia',
        interventionId: 'scene-1-blind-spot',
        interventionForm: 'blind-spot',
      },
    ]);
  });
});
