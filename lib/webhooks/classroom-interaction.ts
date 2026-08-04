import type { StatelessChatRequest } from '@/lib/types/chat';

export function latestExplicitLearnerMessage(
  messages: StatelessChatRequest['messages'],
): StatelessChatRequest['messages'][number] | null {
  const latest = messages[messages.length - 1];
  return latest?.role === 'user' && latest.metadata?.originalRole === 'user' ? latest : null;
}
