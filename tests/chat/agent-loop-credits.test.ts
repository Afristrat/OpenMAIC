import { describe, expect, it, vi } from 'vitest';
import { CreditsBlockedError } from '@/lib/billing/credit-error-message';
import {
  runAgentLoop,
  type AgentLoopCallbacks,
  type AgentLoopRequest,
} from '@/lib/chat/agent-loop';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const request = { config: { agentIds: ['a'] } } as unknown as AgentLoopRequest;

function callbacks(response: Response): AgentLoopCallbacks {
  return {
    getStoreState: () => ({}),
    getMessages: () => [],
    fetchChat: async () => response,
    onEvent: vi.fn(),
    onIterationEnd: async () => null,
  } as unknown as AgentLoopCallbacks;
}

describe('runAgentLoop et solde épuisé', () => {
  it('lève CreditsBlockedError sur la réponse 402 de /api/chat', async () => {
    const response = new Response(
      JSON.stringify({ success: false, errorCode: 'INSUFFICIENT_CREDITS' }),
      { status: 402 },
    );

    await expect(
      runAgentLoop(request, callbacks(response), new AbortController().signal),
    ).rejects.toBeInstanceOf(CreditsBlockedError);
  });

  it('garde l’erreur générique pour un autre échec HTTP', async () => {
    const response = new Response('boom', { status: 500 });

    await expect(
      runAgentLoop(request, callbacks(response), new AbortController().signal),
    ).rejects.toThrow('API error: 500');
  });
});
