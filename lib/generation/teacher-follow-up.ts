import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/generation';
import { parseJsonResponse } from './json-repair';
import type { AgentInfo, AICallFn } from './pipeline-types';

const log = createLogger('TeacherFollowUp');

/** Une question à l'apprenant (avec attente de sa réponse) revient toutes les N scènes. */
export const LEARNER_DISCUSSION_EVERY = 5;

/** Préfixe d'identifiant des répliques du professeur qui reprennent une intervention. */
export const FOLLOW_UP_ID_PREFIX = 'followup_';

type Language = 'fr' | 'ar' | 'en';

function languageOf(directive?: string): Language {
  const text = directive?.toLowerCase() ?? '';
  if (/arabic|arabe|ar-ma|ar-sa|العربية/u.test(text)) return 'ar';
  if (/french|français|francais|fr-fr/u.test(text)) return 'fr';
  return 'en';
}

function isPreparedIntervention(action: Action, teacherId: string): action is SpeechAction {
  return action.type === 'speech' && Boolean(action.interventionId) && action.agentId !== teacherId;
}

function isFollowUp(action: Action | undefined): boolean {
  return action?.type === 'speech' && action.id.startsWith(FOLLOW_UP_ID_PREFIX);
}

/**
 * Une intervention préparée est écrite d'avance : le modèle ne sait pas ce que le professeur dira
 * ensuite, et le professeur enchaîne sur son plan comme si rien n'avait été dit. Chaque intervention
 * est donc suivie d'une réplique du professeur qui la reprend, générée en connaissant son contenu.
 */
export async function ensureTeacherTakesUpInterventions(
  actions: Action[],
  agents: AgentInfo[] | undefined,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<Action[]> {
  const teacher = agents?.find((agent) => agent.role === 'teacher');
  if (!teacher || !agents) return actions;

  const pending = actions.flatMap((action, index) => {
    if (!isPreparedIntervention(action, teacher.id)) return [];
    const next = actions.slice(index + 1).find((candidate) => candidate.type === 'speech');
    if (isFollowUp(next)) return [];
    const nextTeacherLine = next?.type === 'speech' && next.agentId === teacher.id ? next.text : '';
    return [{ index, intervention: action, nextTeacherLine }];
  });
  if (pending.length === 0) return actions;

  let replies = new Map<string, string>();
  try {
    const response = await aiCall(
      [
        `You write the lead teacher's spoken replies in a classroom. The teacher is "${teacher.name}" (${teacher.persona || teacher.role}).`,
        'For each prepared intervention below, write ONE spoken reply of the teacher, 1 to 3 short sentences, that directly takes it up:',
        '- name the speaker, then answer the question, accept or refute the objection, confirm or nuance the example, or build on the synthesis;',
        '- be specific to what was said, never a generic "good point";',
        '- do not repeat what the teacher says in the line that follows (given for context);',
        '- never invent a learner response; never prefix with a speaker label; no markdown; spoken language only.',
        languageDirective ? `Language directive: ${languageDirective}.` : '',
        'Return only a JSON array of objects {"interventionId": string, "content": string}, one per intervention, in the same order.',
      ]
        .filter(Boolean)
        .join('\n'),
      pending
        .map(({ intervention, nextTeacherLine }) => {
          const speaker = agents.find((agent) => agent.id === intervention.agentId);
          return [
            `interventionId: ${intervention.interventionId}`,
            `speaker: ${speaker?.name ?? intervention.agentId} (${speaker?.role ?? 'agent'})`,
            `form: ${intervention.interventionForm ?? 'unspecified'}`,
            `said: ${intervention.text}`,
            `teacher's next line (context only): ${nextTeacherLine || '(none)'}`,
          ].join('\n');
        })
        .join('\n\n'),
    );
    const parsed =
      parseJsonResponse<Array<{ interventionId?: unknown; content?: unknown }>>(response);
    replies = new Map(
      (Array.isArray(parsed) ? parsed : []).flatMap((item) =>
        typeof item.interventionId === 'string' &&
        typeof item.content === 'string' &&
        item.content.trim()
          ? [[item.interventionId, item.content.trim()] as const]
          : [],
      ),
    );
  } catch (error) {
    log.warn('Teacher follow-up generation failed, using the neutral acknowledgement:', error);
  }

  const language = languageOf(languageDirective);
  const inserted = new Map<number, Action>();
  for (const { index, intervention } of pending) {
    const speaker = agents.find((agent) => agent.id === intervention.agentId);
    const text =
      replies.get(intervention.interventionId ?? '') ??
      neutralAcknowledgement(language, speaker?.name ?? '');
    inserted.set(index, {
      id: `${FOLLOW_UP_ID_PREFIX}${nanoid(8)}`,
      type: 'speech',
      text,
      agentId: teacher.id,
    });
  }
  return actions.flatMap((action, index) => {
    const reply = inserted.get(index);
    return reply ? [action, reply] : [action];
  });
}

function neutralAcknowledgement(language: Language, name: string): string {
  const who = name.trim();
  if (language === 'fr') {
    return who
      ? `Merci ${who}. Gardons ce point en tête, nous y reviendrons dans la suite.`
      : 'Merci pour cette remarque. Gardons ce point en tête, nous y reviendrons dans la suite.';
  }
  if (language === 'ar') {
    return who
      ? `شكراً ${who}. لنحتفظ بهذه النقطة في أذهاننا وسنعود إليها لاحقاً.`
      : 'شكراً على هذه الملاحظة. لنحتفظ بها في أذهاننا وسنعود إليها لاحقاً.';
  }
  return who
    ? `Thank you, ${who}. Let us keep that point in mind, we will come back to it.`
    : 'Thank you for that remark. Let us keep it in mind, we will come back to it.';
}

/** Vrai quand la scène doit se terminer par une vraie question à l'apprenant. */
export function isLearnerDiscussionScene(outline: SceneOutline): boolean {
  return (
    outline.type === 'slide' && outline.order > 0 && outline.order % LEARNER_DISCUSSION_EVERY === 0
  );
}

/**
 * Demande au modèle de terminer la scène par une question à l'apprenant avec attente de sa réponse.
 * Retourne une consigne vide quand la scène n'est pas concernée.
 */
export function learnerDiscussionInstruction(outline: SceneOutline): string {
  if (!isLearnerDiscussionScene(outline)) return '';
  return [
    'MANDATORY for this page: end the action sequence with exactly one `discussion` action.',
    "Right before it, the teacher asks the learner ONE concrete question out loud, tied to the learner's own job and to this page, then stops speaking.",
    'The `discussion` topic is that same question. This page overrides the general frequency rule about discussions.',
  ].join(' ');
}

/**
 * Filet de sécurité : si le modèle n'a pas posé la question demandée, la scène se termine quand même
 * par une question à l'apprenant et une attente de sa réponse.
 */
export function ensureLearnerDiscussion(
  actions: Action[],
  outline: SceneOutline,
  agents: AgentInfo[] | undefined,
  languageDirective?: string,
): Action[] {
  if (!isLearnerDiscussionScene(outline)) return actions;
  if (actions.some((action) => action.type === 'discussion')) return actions;

  const teacher = agents?.find((agent) => agent.role === 'teacher');
  const students = agents?.filter((agent) => agent.role === 'student') ?? [];
  const asker = students[0] ?? agents?.find((agent) => agent.role !== 'teacher');
  const language = languageOf(languageDirective);
  const title = outline.title;
  const question =
    language === 'fr'
      ? `Dans votre propre pratique, où retrouvez-vous « ${title} » ? Prenez un instant et dites-le-nous.`
      : language === 'ar'
        ? `في ممارستك الخاصة، أين تجد «${title}»؟ خذ لحظة وأخبرنا.`
        : `In your own practice, where do you meet “${title}”? Take a moment and tell us.`;
  log.warn(`Scene ${outline.id}: no learner question generated, adding the neutral one`);
  return [
    ...actions,
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      text: question,
      ...(teacher ? { agentId: teacher.id } : {}),
    },
    {
      id: `action_${nanoid(8)}`,
      type: 'discussion',
      topic: question,
      ...(asker ? { agentId: asker.id } : {}),
    },
  ];
}
