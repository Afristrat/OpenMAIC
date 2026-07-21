import type { TTSProviderId } from '@/lib/audio/types';
import { FORMATION_ENGINE_CONSUMERS } from '@/lib/formation-engine/downstream-consumers';

export type AgentGender = 'female' | 'male';
export type AudienceStage = 'child' | 'adolescent' | 'higher-education' | 'adult-professional';
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'advanced';
export type InteractionLevel = 'guided' | 'balanced' | 'immersive';
export type LearningApproach = 'pedagogy' | 'hybrid' | 'andragogy';

export interface InteractionWeights {
  guided: number;
  balanced: number;
  immersive: number;
}

export interface PersonaDefinition {
  id: string;
  label: string;
  role: 'teacher' | 'assistant' | 'student';
  defaultName: string;
  gender: AgentGender;
  avatar: string;
  color: string;
  persona: string;
  providerId: TTSProviderId;
  voiceId: string;
  interactionWeights: InteractionWeights;
}

export interface TenantPersonaProfile extends PersonaDefinition {
  enabled: boolean;
}

export interface LearningDesignSettings {
  audienceStage: AudienceStage;
  expertiseLevel: ExpertiseLevel;
  interactionLevel: InteractionLevel;
  personas: TenantPersonaProfile[];
}

export const PERSONA_FORMATION_ENGINE_CONSUMER_ID =
  FORMATION_ENGINE_CONSUMERS.livePersonalityRegistry;

/**
 * The ten pedagogical mechanisms promised on the landing page.
 * Weights are editable product defaults, expressed as a share of non-user turns.
 * Each interaction-level column totals 100 across the complete roster.
 */
export const PERSONA_CATALOG: readonly PersonaDefinition[] = [
  {
    id: 'professor',
    label: 'Professeur IA',
    role: 'teacher',
    defaultName: 'Younes',
    gender: 'male',
    avatar: '/avatars/teacher.png',
    color: '#3b82f6',
    providerId: 'higgs-tts',
    voiceId: 'younes',
    interactionWeights: { guided: 40, balanced: 28, immersive: 20 },
    persona:
      "Enseignant principal. Il incarne une autorité chaleureuse, tient le fil de la session, distribue la parole et conclut avec clarté sans monopoliser l'échange.",
  },
  {
    id: 'teaching-assistant',
    label: 'Assistant pédagogique',
    role: 'assistant',
    defaultName: 'Salma',
    gender: 'female',
    avatar: '/avatars/assist.png',
    color: '#10b981',
    providerId: 'higgs-tts',
    voiceId: 'salma',
    interactionWeights: { guided: 15, balanced: 12, immersive: 10 },
    persona:
      'Assistante pédagogique. Elle repère une expression obscure, reformule avec précision, apporte un autre angle et complète le professeur sans le répéter.',
  },
  {
    id: 'joker',
    label: 'Le Rigolo',
    role: 'student',
    defaultName: 'Rim',
    gender: 'female',
    avatar: '/avatars/clown-2.png',
    color: '#f59e0b',
    providerId: 'higgs-tts',
    voiceId: 'rim',
    interactionWeights: { guided: 2, balanced: 5, immersive: 8 },
    persona:
      'Énergise le groupe par une remarque brève, une analogie mémorable ou un décalage humoristique pertinent. Son humour ne vise jamais une personne et se retire dans les moments sensibles.',
  },
  {
    id: 'curious',
    label: 'Le Curieux',
    role: 'student',
    defaultName: 'Mehdi',
    gender: 'male',
    avatar: '/avatars/curious.png',
    color: '#ec4899',
    providerId: 'higgs-tts',
    voiceId: 'mehdi',
    interactionWeights: { guided: 8, balanced: 10, immersive: 12 },
    persona:
      "Porte la curiosité du groupe. Il demande pourquoi, comment et dans quelles limites, révèle les implicites et formule les questions que l'apprenant n'ose pas encore poser.",
  },
  {
    id: 'secretary',
    label: 'Le Secrétaire',
    role: 'assistant',
    defaultName: 'Hamza',
    gender: 'male',
    avatar: '/avatars/note-taker.png',
    color: '#06b6d4',
    providerId: 'higgs-tts',
    voiceId: 'hamza',
    interactionWeights: { guided: 10, balanced: 8, immersive: 7 },
    persona:
      'Transforme les échanges en synthèses fidèles et structurées. Il fait ressortir les décisions, les points clés et les prochaines actions sans ajouter de contenu absent.',
  },
  {
    id: 'thinker',
    label: 'Le Penseur',
    role: 'assistant',
    defaultName: 'Maryam',
    gender: 'female',
    avatar: '/avatars/thinker.png',
    color: '#8b5cf6',
    providerId: 'higgs-tts',
    voiceId: 'maryam',
    interactionWeights: { guided: 6, balanced: 8, immersive: 9 },
    persona:
      'Approfondit les idées et relie les concepts. Elle ralentit lorsque la réflexion le mérite, explicite les hypothèses et ouvre des implications éthiques ou systémiques.',
  },
  {
    id: 'analyst',
    label: "L'Analyste",
    role: 'assistant',
    defaultName: 'Khalid',
    gender: 'male',
    avatar: '/avatars/note-taker-2.png',
    color: '#6366f1',
    providerId: 'higgs-tts',
    voiceId: 'khalid',
    interactionWeights: { guided: 7, balanced: 8, immersive: 8 },
    persona:
      "Met les affirmations à l'épreuve des faits. Il compare, quantifie, recherche les causes, distingue corrélation et causalité et aide l'apprenant à décider sur des critères explicites.",
  },
  {
    id: 'coach',
    label: 'Le Coach',
    role: 'assistant',
    defaultName: 'Hanae',
    gender: 'female',
    avatar: '/avatars/teacher-2.png',
    color: '#f43f5e',
    providerId: 'higgs-tts',
    voiceId: 'hanae',
    interactionWeights: { guided: 7, balanced: 8, immersive: 9 },
    persona:
      "Encourage avec exigence. Elle demande un prochain pas concret, donne un retour précis sur ce qui est formulé et évite l'enthousiasme creux ou infantilisant.",
  },
  {
    id: 'devils-advocate',
    label: "L'Avocat du Diable",
    role: 'student',
    defaultName: 'Tariq',
    gender: 'male',
    avatar: '/avatars/curious-2.png',
    color: '#ef4444',
    providerId: 'higgs-tts',
    voiceId: 'tariq',
    interactionWeights: { guided: 2, balanced: 6, immersive: 9 },
    persona:
      'Teste la solidité du raisonnement. Il formule une objection crédible, expose un risque ou une hypothèse contraire et pousse le groupe à justifier ses choix sans polémique gratuite.',
  },
  {
    id: 'creative',
    label: 'Le Créatif',
    role: 'student',
    defaultName: 'Layla',
    gender: 'female',
    avatar: '/avatars/assist-2.png',
    color: '#eab308',
    providerId: 'higgs-tts',
    voiceId: 'layla',
    interactionWeights: { guided: 3, balanced: 7, immersive: 8 },
    persona:
      "Ouvre l'espace des possibles. Elle propose une analogie, une combinaison ou une solution inattendue, puis aide à transformer l'idée en expérimentation concrète.",
  },
] as const;

export const DEFAULT_LEARNING_DESIGN: LearningDesignSettings = {
  audienceStage: 'adult-professional',
  expertiseLevel: 'beginner',
  interactionLevel: 'balanced',
  personas: PERSONA_CATALOG.map((persona) => ({ ...persona, enabled: true })),
};

export function approachForAudience(stage: AudienceStage): LearningApproach {
  if (stage === 'adult-professional') return 'andragogy';
  if (stage === 'higher-education') return 'hybrid';
  return 'pedagogy';
}

export function learningDesignFromSettings(settings: unknown): LearningDesignSettings {
  const settingsObject = settings as {
    learningDesign?: Partial<LearningDesignSettings>;
    teachingProfile?: {
      name?: string;
      avatar?: string;
      providerId?: TTSProviderId;
      voiceId?: string;
    };
  } | null;
  const candidate = settingsObject?.learningDesign;
  const legacyTeacher = settingsObject?.teachingProfile;
  const savedById = new Map((candidate?.personas ?? []).map((persona) => [persona.id, persona]));

  return {
    audienceStage: candidate?.audienceStage ?? DEFAULT_LEARNING_DESIGN.audienceStage,
    expertiseLevel: candidate?.expertiseLevel ?? DEFAULT_LEARNING_DESIGN.expertiseLevel,
    interactionLevel: candidate?.interactionLevel ?? DEFAULT_LEARNING_DESIGN.interactionLevel,
    personas: PERSONA_CATALOG.map((definition) => {
      const saved = savedById.get(definition.id);
      const legacyGender = PERSONA_CATALOG.find(
        (persona) => persona.avatar === legacyTeacher?.avatar,
      )?.gender;
      const legacyProfessor =
        !candidate && definition.id === 'professor' && legacyTeacher
          ? {
              defaultName: legacyTeacher.name?.trim() || definition.defaultName,
              avatar: legacyTeacher.avatar || definition.avatar,
              providerId: legacyTeacher.providerId || definition.providerId,
              voiceId: legacyTeacher.voiceId || definition.voiceId,
              gender: legacyGender || definition.gender,
            }
          : undefined;
      return {
        ...definition,
        ...legacyProfessor,
        ...saved,
        id: definition.id,
        role: definition.role,
        label: definition.label,
        interactionWeights: {
          ...definition.interactionWeights,
          ...saved?.interactionWeights,
        },
        enabled: saved?.enabled ?? true,
      };
    }),
  };
}

export function activeInteractionWeight(
  profile: TenantPersonaProfile,
  level: InteractionLevel,
): number {
  return profile.interactionWeights[level];
}

export function buildTenantAgentConfigs(
  design: LearningDesignSettings,
  instructionalDirective: string,
) {
  return design.personas
    .filter((persona) => persona.enabled)
    .map((persona) => {
      const interactionWeight = activeInteractionWeight(persona, design.interactionLevel);
      return {
        id: `persona-${persona.id}`,
        name: persona.defaultName,
        role: persona.role,
        persona: `${persona.persona}\n${instructionalDirective}`,
        avatar: persona.avatar,
        color: persona.color,
        priority: Math.max(1, Math.min(10, Math.round(interactionWeight / 4))),
        interactionWeight,
        mechanismId: persona.id,
        gender: persona.gender,
        voiceConfig: { providerId: persona.providerId, voiceId: persona.voiceId },
      };
    });
}
