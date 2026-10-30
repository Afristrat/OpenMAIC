import { describe, expect, test } from 'vitest';
import {
  FOLLOW_UP_ID_PREFIX,
  ensureLearnerDiscussion,
  ensureTeacherTakesUpInterventions,
  isLearnerDiscussionScene,
  learnerDiscussionInstruction,
} from '@/lib/generation/teacher-follow-up';
import type { AgentInfo } from '@/lib/generation/pipeline-types';
import type { Action } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/generation';

const agents = [
  { id: 'prof', name: 'Hanae', role: 'teacher', persona: 'Pédagogue' },
  { id: 'curious', name: 'Karim', role: 'student', persona: 'Curieux' },
] as AgentInfo[];

const speech = (id: string, agentId: string, text: string, interventionId?: string): Action => ({
  id,
  type: 'speech',
  text,
  agentId,
  ...(interventionId ? { interventionId, interventionForm: 'question' as const } : {}),
});

const outline = (order: number): SceneOutline => ({
  id: `scene-${order}`,
  type: 'slide',
  title: 'Le suivi des relances',
  description: 'Suivre les relances.',
  keyPoints: [],
  order,
});

describe('ensureTeacherTakesUpInterventions', () => {
  test('inserts a teacher reply right after each agent intervention, even at the end of the scene', async () => {
    const actions = [
      speech('a1', 'prof', 'Première étape.'),
      speech('a2', 'curious', 'Comment éviter de se surévaluer ?', 'i-1'),
      speech('a3', 'prof', 'Deuxième étape.'),
      speech('a4', 'curious', 'Et si le client refuse ?', 'i-2'),
    ];
    const result = await ensureTeacherTakesUpInterventions(
      actions,
      agents,
      async () =>
        JSON.stringify([
          { interventionId: 'i-1', content: 'Karim, on compare avec des faits chiffrés.' },
          { interventionId: 'i-2', content: 'Karim, alors on propose un autre créneau.' },
        ]),
      'Français',
    );

    expect(result.map((a) => (a.type === 'speech' ? a.text : a.type))).toEqual([
      'Première étape.',
      'Comment éviter de se surévaluer ?',
      'Karim, on compare avec des faits chiffrés.',
      'Deuxième étape.',
      'Et si le client refuse ?',
      'Karim, alors on propose un autre créneau.',
    ]);
    const reply = result[2];
    expect(reply.type === 'speech' && reply.agentId).toBe('prof');
    expect(reply.id.startsWith(FOLLOW_UP_ID_PREFIX)).toBe(true);
  });

  test('falls back to a neutral acknowledgement that names the speaker when the model fails', async () => {
    const result = await ensureTeacherTakesUpInterventions(
      [speech('a2', 'curious', 'Pourquoi ?', 'i-1')],
      agents,
      async () => {
        throw new Error('indisponible');
      },
      'Français',
    );
    expect(result).toHaveLength(2);
    expect(result[1].type === 'speech' && result[1].text).toContain('Karim');
  });

  test('is idempotent: an intervention already followed by a reply gets no second one', async () => {
    const first = await ensureTeacherTakesUpInterventions(
      [speech('a2', 'curious', 'Pourquoi ?', 'i-1')],
      agents,
      async () => JSON.stringify([{ interventionId: 'i-1', content: 'Karim, parce que.' }]),
    );
    let calls = 0;
    const second = await ensureTeacherTakesUpInterventions(first, agents, async () => {
      calls += 1;
      return '[]';
    });
    expect(second).toHaveLength(2);
    expect(calls).toBe(0);
  });

  test('does nothing without a teacher or without interventions', async () => {
    const plain = [speech('a1', 'prof', 'Bonjour.')];
    expect(await ensureTeacherTakesUpInterventions(plain, agents, async () => '[]')).toEqual(plain);
    const onlyStudents = [speech('a2', 'curious', 'Pourquoi ?', 'i-1')];
    expect(
      await ensureTeacherTakesUpInterventions(onlyStudents, [agents[1]], async () => '[]'),
    ).toEqual(onlyStudents);
  });
});

describe('learner discussion', () => {
  test('targets one slide every fifth scene, never the opening scene', () => {
    expect(isLearnerDiscussionScene(outline(0))).toBe(false);
    expect(isLearnerDiscussionScene(outline(4))).toBe(false);
    expect(isLearnerDiscussionScene(outline(5))).toBe(true);
    expect(isLearnerDiscussionScene(outline(10))).toBe(true);
    expect(learnerDiscussionInstruction(outline(3))).toBe('');
    expect(learnerDiscussionInstruction(outline(5))).toContain('discussion');
  });

  test('adds the teacher question and a discussion when the model forgot it', () => {
    const result = ensureLearnerDiscussion(
      [speech('a1', 'prof', 'Voilà.')],
      outline(5),
      agents,
      'Français',
    );
    expect(result.map((a) => a.type)).toEqual(['speech', 'speech', 'discussion']);
    const discussion = result[2];
    expect(discussion.type === 'discussion' && discussion.agentId).toBe('curious');
    expect(discussion.type === 'discussion' && discussion.topic).toContain('Le suivi des relances');
  });

  test('leaves a scene alone when it already has a discussion or is not concerned', () => {
    const withDiscussion: Action[] = [
      speech('a1', 'prof', 'Et vous ?'),
      { id: 'd1', type: 'discussion', topic: 'Et vous ?' },
    ];
    expect(ensureLearnerDiscussion(withDiscussion, outline(5), agents)).toEqual(withDiscussion);
    const plain = [speech('a1', 'prof', 'Voilà.')];
    expect(ensureLearnerDiscussion(plain, outline(3), agents)).toEqual(plain);
  });
});
