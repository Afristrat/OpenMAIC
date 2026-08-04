import { describe, expect, it } from 'vitest';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { latestExplicitLearnerMessage } from '@/lib/webhooks/classroom-interaction';

const message = (
  role: 'user' | 'assistant',
  originalRole: 'user' | 'agent',
  id: string,
): StatelessChatRequest['messages'][number] => ({
  id,
  role,
  parts: [{ type: 'text', text: id }],
  metadata: { originalRole },
});

describe('classroom interaction delivery', () => {
  it('selects only a latest explicit learner turn', () => {
    const learner = message('user', 'user', 'learner-1');

    expect(latestExplicitLearnerMessage([learner])).toBe(learner);
    expect(
      latestExplicitLearnerMessage([learner, message('assistant', 'agent', 'agent-1')]),
    ).toBeNull();
    expect(latestExplicitLearnerMessage([message('user', 'agent', 'synthetic')])).toBeNull();
  });
});
