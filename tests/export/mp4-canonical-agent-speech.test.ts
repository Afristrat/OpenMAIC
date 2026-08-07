import { describe, expect, test } from 'vitest';
import { collectSceneSpeechActions } from '@/lib/export/mp4/build-classroom-video';

describe('MP4 canonical multi-agent speech', () => {
  test('keeps teacher and prepared agent audio in canonical order', () => {
    expect(
      collectSceneSpeechActions([
        { id: 'focus', type: 'spotlight', elementId: 'title' },
        {
          id: 'teacher-line',
          type: 'speech',
          text: 'Commençons par cette hypothèse.',
          agentId: 'teacher',
          audioUrl: '/api/classroom-media/c/audio/teacher.wav',
        },
        {
          id: 'agent-line',
          type: 'speech',
          text: 'Quel fait pourrait la réfuter ?',
          agentId: 'analyst',
          interventionId: 'scene-1-blind-spot',
          interventionForm: 'blind-spot',
          audioUrl: '/api/classroom-media/c/audio/analyst.wav',
        },
      ]),
    ).toEqual([
      expect.objectContaining({ agentId: 'teacher', audioUrl: expect.stringContaining('teacher') }),
      expect.objectContaining({
        agentId: 'analyst',
        interventionId: 'scene-1-blind-spot',
        audioUrl: expect.stringContaining('analyst'),
      }),
    ]);
  });
});
