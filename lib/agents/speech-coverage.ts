import type { SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

interface ActiveAgent {
  id: string;
  name: string;
  role: string;
  mechanismId?: string;
}

type SupportedLocale = 'fr-FR' | 'ar-MA' | 'en-US';
type InterventionForm = NonNullable<SpeechAction['interventionForm']>;

const FORMS: Readonly<Record<string, InterventionForm>> = {
  professor: 'synthesis',
  'teaching-assistant': 'clarification',
  joker: 'humor',
  curious: 'question',
  secretary: 'synthesis',
  thinker: 'blind-spot',
  analyst: 'challenge',
  coach: 'feedback',
  'devils-advocate': 'objection',
  creative: 'example',
};

const FRENCH_TEXT: Readonly<Record<string, (title: string) => string>> = {
  professor: (title) => `Retenons l’essentiel de « ${title} » avant de poursuivre.`,
  'teaching-assistant': (title) =>
    `Reformulons « ${title} » avec des mots directement utilisables.`,
  joker: (title) => `Pour mémoriser « ${title} », quelle image simple garderiez-vous en tête ?`,
  curious: (title) => `Quelle hypothèse de « ${title} » mérite encore d’être vérifiée ?`,
  secretary: (title) => `Notons la décision et le prochain pas issus de « ${title} ».`,
  thinker: (title) => `Quelle conséquence moins visible de « ${title} » devons-nous examiner ?`,
  analyst: (title) => `Quel chiffre ou quel fait permet de vérifier « ${title} » ?`,
  coach: (title) => `Quel premier geste concret allez-vous tirer de « ${title} » ?`,
  'devils-advocate': (title) =>
    `Qu’est-ce qui pourrait invalider notre raisonnement sur « ${title} » ?`,
  creative: (title) => `Quelle autre piste concrète pourrait enrichir « ${title} » ?`,
};

const ENGLISH_TEXT: Readonly<Record<string, (title: string) => string>> = {
  professor: (title) => `Let us retain the essential point from “${title}” before continuing.`,
  'teaching-assistant': (title) => `Let us restate “${title}” in directly usable terms.`,
  joker: (title) => `What simple image would help you remember “${title}”?`,
  curious: (title) => `Which assumption in “${title}” still deserves verification?`,
  secretary: (title) => `Let us record the decision and next step from “${title}”.`,
  thinker: (title) => `Which less visible consequence of “${title}” should we examine?`,
  analyst: (title) => `Which figure or fact would verify “${title}”?`,
  coach: (title) => `What first concrete action will you take from “${title}”?`,
  'devils-advocate': (title) => `What could invalidate our reasoning about “${title}”?`,
  creative: (title) => `What other concrete avenue could enrich “${title}”?`,
};

const ARABIC_TEXT: Readonly<Record<string, (title: string) => string>> = {
  professor: (title) => `لنحتفظ بالفكرة الأساسية من «${title}» قبل المتابعة.`,
  'teaching-assistant': (title) => `لنعِد صياغة «${title}» بعبارات قابلة للاستخدام مباشرة.`,
  joker: (title) => `ما الصورة البسيطة التي تساعدكم على تذكّر «${title}»؟`,
  curious: (title) => `أي فرضية في «${title}» ما زالت تستحق التحقق؟`,
  secretary: (title) => `لنسجل القرار والخطوة التالية المستخلصة من «${title}».`,
  thinker: (title) => `ما النتيجة الأقل وضوحًا في «${title}» التي ينبغي فحصها؟`,
  analyst: (title) => `ما الرقم أو الواقعة التي تسمح بالتحقق من «${title}»؟`,
  coach: (title) => `ما أول خطوة عملية ستطبقونها انطلاقًا من «${title}»؟`,
  'devils-advocate': (title) => `ما الذي قد يُبطل استدلالنا بشأن «${title}»؟`,
  creative: (title) => `ما المسار العملي الآخر الذي قد يثري «${title}»؟`,
};

function localeText(locale: SupportedLocale): Readonly<Record<string, (title: string) => string>> {
  if (locale === 'ar-MA') return ARABIC_TEXT;
  if (locale === 'en-US') return ENGLISH_TEXT;
  return FRENCH_TEXT;
}

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Last-resort invariant repair for a complete classroom cast.
 *
 * Scene generation normally assigns every active agent a canonical intervention.
 * If a provider drops one required speaker, preserve the product contract with a
 * deterministic, localized and mechanism-specific intervention before TTS and
 * persistence instead of publishing a silent avatar or discarding the course.
 */
export function ensurePersistedSpeechCoverage(
  scenes: readonly Scene[],
  agents: readonly ActiveAgent[],
  locale: SupportedLocale,
): { scenes: readonly Scene[]; insertedAgentIds: string[] } {
  const speakingAgentIds = new Set(
    scenes.flatMap(({ actions = [] }) =>
      actions.flatMap((action) =>
        action.type === 'speech' && action.agentId ? [action.agentId] : [],
      ),
    ),
  );
  const missingAgents = agents.filter((agent) => !speakingAgentIds.has(agent.id));
  if (missingAgents.length === 0 || scenes.length === 0) {
    return { scenes, insertedAgentIds: [] };
  }

  const textByMechanism = localeText(locale);
  const nextScenes = scenes.map((scene) => ({
    ...scene,
    actions: [...(scene.actions ?? [])],
  }));

  for (const agent of missingAgents) {
    const agentIndex = Math.max(
      0,
      agents.findIndex((candidate) => candidate.id === agent.id),
    );
    const scene = nextScenes[agentIndex % nextScenes.length];
    const mechanism = agent.mechanismId ?? agent.id.replace(/^persona-/u, '');
    const textFactory = textByMechanism[mechanism];
    const text = textFactory
      ? textFactory(scene.title)
      : locale === 'ar-MA'
        ? `ما المثال العملي الذي يضيفه ${agent.name} إلى «${scene.title}»؟`
        : locale === 'en-US'
          ? `What practical example would ${agent.name} add to “${scene.title}”?`
          : `Quel exemple concret ${agent.name} ajouterait-il à « ${scene.title} » ?`;
    const action: SpeechAction = {
      id: `coverage-${stableIdPart(scene.id)}-${stableIdPart(agent.id)}`,
      type: 'speech',
      text,
      agentId: agent.id,
      interventionId: `${scene.id}-${agent.id}-coverage`,
      interventionForm: FORMS[mechanism] ?? 'example',
    };
    const discussionIndex = scene.actions.findIndex((candidate) => candidate.type === 'discussion');
    scene.actions.splice(discussionIndex < 0 ? scene.actions.length : discussionIndex, 0, action);
  }

  return { scenes: nextScenes, insertedAgentIds: missingAgents.map(({ id }) => id) };
}
