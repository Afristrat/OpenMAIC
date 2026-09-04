import { describe, expect, it } from 'vitest';
import { resolveTeacherDisplay } from '@/lib/agents/teacher-display';

describe('teacher display identity', () => {
  it('prefers the classroom casting over device-level voice settings', () => {
    expect(
      resolveTeacherDisplay(
        { name: 'Younes', avatar: '/avatars/teacher.png', gender: 'male' },
        {
          name: 'Hanae',
          avatar: '/avatars/teacher-2.png',
          providerId: 'higgs-tts',
          voiceId: 'hanae',
        },
        'female',
      ),
    ).toEqual({ name: 'Hanae', avatar: '/avatars/teacher-2.png', gender: 'female' });
  });

  it('keeps the device-level identity for a classroom without persisted casting', () => {
    expect(
      resolveTeacherDisplay(
        { name: 'Younes', avatar: '/avatars/teacher.png', gender: 'male' },
        undefined,
        undefined,
      ),
    ).toEqual({ name: 'Younes', avatar: '/avatars/teacher.png', gender: 'male' });
  });
});
