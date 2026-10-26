import { describe, expect, it } from 'vitest';
import { hasVoiceCasting } from '@/lib/audio/voice-casting-availability';

describe('hasVoiceCasting', () => {
  it('refuses a missing stage and a stage with no casting', () => {
    expect(hasVoiceCasting(null)).toBe(false);
    expect(hasVoiceCasting(undefined)).toBe(false);
    expect(hasVoiceCasting({})).toBe(false);
    expect(hasVoiceCasting({ generatedAgentConfigs: [] })).toBe(false);
  });

  it('accepts a teacher profile or generated agents', () => {
    expect(
      hasVoiceCasting({
        teacherProfile: { name: 'Hanae', avatar: 'a.png', providerId: 'p', voiceId: 'v' },
      }),
    ).toBe(true);
    expect(
      hasVoiceCasting({
        generatedAgentConfigs: [
          {
            id: 'a1',
            name: 'Hanae',
            role: 'teacher',
            persona: 'p',
            avatar: 'a.png',
            color: '#000',
            priority: 1,
          },
        ],
      }),
    ).toBe(true);
  });
});
