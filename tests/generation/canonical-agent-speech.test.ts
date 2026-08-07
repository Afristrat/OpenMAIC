import { describe, expect, test } from 'vitest';
import { parseActionsFromStructuredOutput } from '@/lib/generation/action-parser';
import { generateSceneActions } from '@/lib/generation/scene-generator';
import { resolveCanonicalSpeechVoice } from '@/lib/server/classroom-media-generation';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';

describe('canonical agent speech', () => {
  test('preserves the authored agent identity and intervention form', () => {
    const [speech] = parseActionsFromStructuredOutput(
      JSON.stringify([
        {
          type: 'text',
          content: 'Et si cette hypothèse était fausse ?',
          agentId: 'agent-analyst',
          interventionId: 'scene-1-objection',
          interventionForm: 'objection',
        },
      ]),
    );

    expect(speech).toMatchObject({
      type: 'speech',
      text: 'Et si cette hypothèse était fausse ?',
      agentId: 'agent-analyst',
      interventionId: 'scene-1-objection',
      interventionForm: 'objection',
    });
  });

  test('uses the speaking agent voice instead of the classroom default', () => {
    expect(
      resolveCanonicalSpeechVoice(
        {
          id: 'speech-1',
          type: 'speech',
          text: 'Regardons cet angle mort.',
          agentId: 'agent-analyst',
        },
        { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
        [
          {
            id: 'agent-analyst',
            voiceConfig: { providerId: 'higgs-tts', voiceId: 'analyst-voice' },
          },
        ],
      ),
    ).toEqual({ providerId: 'higgs-tts', voiceId: 'analyst-voice' });
  });

  test('asks the generation model for attributable preproduced agent interventions', async () => {
    let renderedSystem = '';
    const outline: SceneOutline = {
      id: 'scene-1',
      type: 'slide',
      title: 'Hypothèses',
      description: 'Examiner une hypothèse de travail.',
      keyPoints: ['Identifier les hypothèses', 'Chercher un angle mort'],
      order: 0,
    };
    const content: GeneratedSlideContent = {
      elements: [],
      background: undefined,
      remark: '',
    };

    const actions = await generateSceneActions(
      outline,
      content,
      async (system) => {
        renderedSystem = system;
        return JSON.stringify([
          { type: 'text', content: 'Commençons par expliciter notre hypothèse.', agentId: 'teacher' },
          {
            type: 'text',
            content: 'Quel fait pourrait invalider cette hypothèse ?',
            agentId: 'analyst',
            interventionId: 'scene-1-blind-spot',
            interventionForm: 'blind-spot',
          },
        ]);
      },
      {
        agents: [
          { id: 'teacher', name: 'Hanae', role: 'teacher' },
          { id: 'analyst', name: 'Nadia', role: 'student', persona: 'Cherche les angles morts.' },
        ],
      },
    );

    expect(renderedSystem).toContain('preproduced agent intervention');
    expect(renderedSystem).not.toContain('Single voice, teacher only');
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'speech',
          agentId: 'analyst',
          interventionId: 'scene-1-blind-spot',
          interventionForm: 'blind-spot',
        }),
      ]),
    );
  });

  test('refuses a hallucinated speaker identity instead of assigning the wrong avatar and voice', async () => {
    const actions = await generateSceneActions(
      {
        id: 'scene-1',
        type: 'slide',
        title: 'Hypothèses',
        description: 'Examiner une hypothèse de travail.',
        keyPoints: ['Identifier les hypothèses'],
        order: 0,
      },
      { elements: [], background: undefined, remark: '' },
      async () =>
        JSON.stringify([
          {
            type: 'text',
            content: 'Je vois un angle mort.',
            agentId: 'agent-invented',
            interventionId: 'invented-beat',
            interventionForm: 'blind-spot',
          },
        ]),
      {
        agents: [
          { id: 'teacher', name: 'Hanae', role: 'teacher' },
          { id: 'analyst', name: 'Nadia', role: 'student' },
        ],
      },
    );

    expect(actions[0]).toMatchObject({ type: 'speech', agentId: 'teacher' });
    expect(actions[0]).not.toHaveProperty('interventionId');
    expect(actions[0]).not.toHaveProperty('interventionForm');
  });
});
