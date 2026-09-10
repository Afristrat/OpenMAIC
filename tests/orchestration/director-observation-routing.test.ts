import { beforeEach, expect, it, vi } from 'vitest';
import type { LanguageModel } from 'ai';
const mocks = vi.hoisted(() => ({
  observation: vi.fn(),
  decision: vi.fn(),
  generate: vi.fn(),
  begin: vi.fn(),
  select: vi.fn(),
  finish: vi.fn(),
  failStream: false,
}));
vi.mock('@/lib/orchestration/director-receipts', () => ({
  beginDirectorReceipt: mocks.begin,
  selectDirectorReceipt: mocks.select,
  finishDirectorReceipt: mocks.finish,
}));
vi.mock('@/lib/orchestration/prompt-builder', () => ({ buildStructuredPrompt: () => 'prompt' }));
vi.mock('@/lib/orchestration/observed-director', () => ({
  observeDirectorChoice: mocks.observation,
}));
vi.mock('@/lib/orchestration/director-prompt', () => ({
  buildDirectorPrompt: () => 'prompt',
  parseDirectorDecision: mocks.decision,
}));
vi.mock('@/lib/orchestration/ai-sdk-adapter', () => ({
  AISdkLangGraphAdapter: class {
    _generate = mocks.generate;
    async *streamGenerate() {
      if (mocks.failStream) throw new Error('generation failed');
      yield { type: 'delta', content: '[{"type":"text","content":"A useful response."}]' };
    }
  },
}));
vi.mock('@/lib/mcp/runtime', () => ({ getRequestMCPTools: async () => ({}) }));
import {
  buildInitialState,
  directorNode,
  createOrchestrationGraph,
} from '@/lib/orchestration/director-graph';
import { parseAnimationConstitution } from '@/lib/formation-engine/animation-constitution';
function state() {
  return buildInitialState(
    {
      messages: [],
      storeState: {
        stage: null,
        scenes: [],
        currentSceneId: null,
        mode: 'playback',
        whiteboardOpen: false,
      },
      config: {
        agentIds: ['teacher', 'peer'],
        agentConfigs: ['teacher', 'peer'].map((id) => ({
          id,
          name: id,
          role: 'teacher',
          persona: 'Explain clearly',
          avatar: '',
          color: '#000000',
          allowedActions: [],
          priority: 1,
        })),
      },
      apiKey: '',
    },
    {} as LanguageModel,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.failStream = false;
  mocks.begin.mockResolvedValue('00000000-0048-4000-8000-000000000033');
  mocks.generate.mockResolvedValue({ generations: [{ text: 'decision' }] });
  mocks.decision.mockReturnValue({ shouldEnd: false, nextAgentId: 'teacher' });
  mocks.observation.mockResolvedValue({
    cohort: 'data-driven',
    reason: 'observed-pattern',
    suggestion: {
      agentId: 'peer',
      sampleSize: 1,
      observedMeanQuizScore: 0,
      evidence: 'observational',
    },
  });
});
it('changes the actual dispatched agent and exposes the observation rather than a claimed gain', async () => {
  const writer = vi.fn();
  const result = await directorNode(state(), { writer });
  expect(result).toMatchObject({ currentAgentId: 'peer', shouldEnd: false });
  expect(mocks.begin).toHaveBeenCalledWith(undefined, null, 'teacher');
  expect(mocks.select).toHaveBeenCalledWith(
    '00000000-0048-4000-8000-000000000033',
    'peer',
    expect.objectContaining({ cohort: 'data-driven' }),
    expect.any(Number),
  );
  expect(writer).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'thinking',
      data: expect.objectContaining({
        agentId: 'peer',
        directorObservation: expect.objectContaining({
          suggestion: expect.objectContaining({ sampleSize: 1 }),
        }),
      }),
    }),
  );
});

it('uses the server receipt in the actual message ID and confirms generation separately', async () => {
  const id = '00000000-0048-4000-8000-000000000033';
  for (const failed of [false, true]) {
    mocks.failStream = failed;
    const events = [];
    for await (const event of await createOrchestrationGraph().stream(state(), {
      streamMode: 'custom',
    }))
      events.push(event);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'agent_start',
        data: expect.objectContaining({ messageId: `assistant-${id}`, agentId: 'peer' }),
      }),
    );
    expect(mocks.finish).toHaveBeenLastCalledWith(id, failed ? 'failed' : 'completed');
  }
});
it('preserves classic dispatch without evidence and never overrides USER, END or explicit first agent', async () => {
  mocks.observation.mockResolvedValueOnce(null);
  expect((await directorNode(state(), { writer: vi.fn() })).currentAgentId).toBe('teacher');
  mocks.observation.mockClear();
  for (const nextAgentId of ['USER', null]) {
    mocks.decision.mockReturnValueOnce({ shouldEnd: nextAgentId === null, nextAgentId });
    expect((await directorNode(state(), { writer: vi.fn() })).shouldEnd).toBe(true);
  }
  const triggered = state();
  triggered.triggerAgentId = 'teacher';
  expect((await directorNode(triggered, { writer: vi.fn() })).currentAgentId).toBe('teacher');
  expect(mocks.observation).not.toHaveBeenCalled();
});

it('constrains observed choices to the authored andragogical rules and preserves learner turns', async () => {
  const parsed = parseAnimationConstitution({
    schemaVersion: 1,
    classroomId: 'classroom-1',
    authoredBy: { userId: 'author-1', role: 'author', organizationId: 'org-1' },
    approach: 'andragogy',
    interactionLevel: 'immersive',
    learningIntent: {
      targetPerformance: 'Expliquer puis appliquer une décision professionnelle.',
      successEvidence: ['Une application justifiée dans le contexte professionnel.'],
    },
    policy: {
      responseMode: 'adaptive',
      weightSource: 'organization-roster-snapshot',
      allowedModalities: ['text', 'voice'],
      prohibitedTopics: [],
      maxConsecutiveAgentTurns: 1,
      numericPolicyRationale:
        'Préserver une réponse réelle de l’apprenant entre les interventions.',
    },
    agentRosterSnapshot: ['teacher', 'peer'].map((agentId) => ({
      agentId,
      displayName: agentId,
      avatarId: agentId,
      voiceId: agentId,
      identityCompatibility: 'validated',
      organizationWeight: 50,
      enabled: true,
      allowedForms: ['question'],
      allowedModalities: ['text', 'voice'],
    })),
    authoredBackbone: [
      {
        id: 'beat-1',
        sceneId: 'scene-1',
        moment: 'after',
        activation: 'if-needed',
        purpose: 'Vérifier le transfert au contexte professionnel.',
        preferredForms: ['question'],
        eligibleAgentIds: ['teacher'],
        modality: 'both',
      },
    ],
    adaptiveRules: [
      {
        id: 'rule-1',
        trigger: 'hesitation',
        purpose: 'Clarifier le raisonnement de l’apprenant.',
        allowedForms: ['question'],
        eligibleAgentIds: ['teacher'],
        requiresGrounding: false,
        mayInterrupt: false,
        enabled: true,
      },
    ],
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error(parsed.errors.join('; '));
  const input = state();
  input.animationConstitution = parsed.constitution;
  input.storeState.currentSceneId = 'scene-1';
  mocks.decision.mockReturnValue({
    shouldEnd: false,
    nextAgentId: 'teacher',
    trigger: 'hesitation',
    form: 'question',
    reason: 'Clarifier le raisonnement exprimé par l’apprenant.',
  });
  expect((await directorNode(input, { writer: vi.fn() })).currentAgentId).toBe('teacher');
  expect(mocks.observation.mock.calls[0][2]).toEqual(['teacher']);

  input.animationConstitution.adaptiveRules[0].eligibleAgentIds.push('peer');
  const writer = vi.fn();
  expect((await directorNode(input, { writer })).currentAgentId).toBe('peer');
  expect(writer).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'intervention_decision',
      data: expect.objectContaining({ agentId: 'peer', trigger: 'hesitation', form: 'question' }),
    }),
  );

  mocks.observation.mockClear();
  input.turnCount = 1;
  expect((await directorNode(input, { writer: vi.fn() })).shouldEnd).toBe(true);
  expect(mocks.observation).not.toHaveBeenCalled();
});
