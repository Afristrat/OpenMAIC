import { describe, expect, test } from 'vitest';
import { parseActionsFromStructuredOutput } from '@/lib/generation/action-parser';
import { resolveCanonicalSpeechVoice } from '@/lib/server/classroom-media-generation';

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
});
