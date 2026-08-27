import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { PERSONA_CATALOG } from '@/lib/agents/persona-catalog';
import type { GeneratedAgentConfig, Scene, Stage } from '@/lib/types/stage';

type TeacherProfile = NonNullable<Stage['teacherProfile']>;

export class ClassroomCastingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassroomCastingError';
  }
}

export interface CanonicalClassroomCasting {
  stage: Stage;
  scenes: Scene[];
  teacherProfile: TeacherProfile;
  agents: GeneratedAgentConfig[];
  changed: boolean;
}

export type ClassroomVoiceOverrides = Record<
  string,
  { providerId: TTSProviderId; modelId?: string; voiceId: string }
>;

function profileFromTeacher(teacher: GeneratedAgentConfig): TeacherProfile {
  if (!teacher.voiceConfig) {
    throw new ClassroomCastingError(`Le professeur ${teacher.id} ne possède aucune voix.`);
  }
  return {
    name: teacher.name,
    avatar: teacher.avatar,
    providerId: teacher.voiceConfig.providerId,
    voiceId: teacher.voiceConfig.voiceId,
  };
}

function profilesEqual(left: TeacherProfile | undefined, right: TeacherProfile): boolean {
  return (
    left?.name === right.name &&
    left.avatar === right.avatar &&
    left.providerId === right.providerId &&
    left.voiceId === right.voiceId
  );
}

function knownVoiceGender(providerId: string, voiceId: string): 'female' | 'male' | undefined {
  const provider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  const gender = provider?.voices.find((voice) => voice.id === voiceId)?.gender;
  return gender === 'female' || gender === 'male' ? gender : undefined;
}

function knownAvatarGender(avatar: string): 'female' | 'male' | undefined {
  return PERSONA_CATALOG.find((persona) => persona.avatar === avatar)?.gender;
}

function normalizedAgent(agent: GeneratedAgentConfig): GeneratedAgentConfig {
  let candidate = agent;
  if (!candidate.voiceConfig) {
    const matchingPersonas = PERSONA_CATALOG.filter(
      (persona) => persona.avatar === candidate.avatar,
    );
    if (matchingPersonas.length !== 1) {
      throw new ClassroomCastingError(
        `L’agent ${candidate.id} ne possède aucune voix persistante.`,
      );
    }
    const persona = matchingPersonas[0];
    candidate = {
      ...candidate,
      gender: candidate.gender ?? persona.gender,
      mechanismId: candidate.mechanismId ?? persona.id,
      voiceConfig: { providerId: persona.providerId, voiceId: persona.voiceId },
    };
  }
  const voiceConfig = candidate.voiceConfig;
  if (!voiceConfig) {
    throw new ClassroomCastingError(`L’agent ${candidate.id} ne possède aucune voix persistante.`);
  }
  const voiceGender = knownVoiceGender(voiceConfig.providerId, voiceConfig.voiceId);
  const avatarGender = knownAvatarGender(candidate.avatar);
  const gender = candidate.gender ?? voiceGender ?? avatarGender;
  if (voiceGender && gender && voiceGender !== gender) {
    throw new ClassroomCastingError(
      `La voix de l’agent ${candidate.id} ne correspond pas à son genre.`,
    );
  }
  if (avatarGender && gender && avatarGender !== gender) {
    throw new ClassroomCastingError(
      `L’avatar de l’agent ${candidate.id} ne correspond pas à son genre.`,
    );
  }
  if (voiceGender && avatarGender && voiceGender !== avatarGender) {
    throw new ClassroomCastingError(
      `La voix et l’avatar de l’agent ${candidate.id} sont incompatibles.`,
    );
  }
  return gender && candidate.gender !== gender ? { ...candidate, gender } : candidate;
}

/**
 * Apply the author's persisted per-agent choices to the server casting before
 * scene or media generation. The teacher remains governed by the dedicated
 * teacherVoiceConfig contract, while every other known identity keeps its
 * name/avatar/gender and is rejected if a known voice contradicts that cast.
 */
export function applyClassroomVoiceOverrides<T extends GeneratedAgentConfig>(
  agents: T[],
  overrides?: ClassroomVoiceOverrides,
): T[] {
  if (!overrides) return agents;
  return agents.map((agent) => {
    const override = overrides[agent.id];
    if (!override || agent.role === 'teacher') return agent;
    const candidate: T = {
      ...agent,
      voiceConfig: {
        providerId: override.providerId,
        ...(override.modelId ? { modelId: override.modelId } : {}),
        voiceId: override.voiceId,
      },
    };
    normalizedAgent(candidate);
    return candidate;
  });
}

function legacyTeacher(profile: TeacherProfile): GeneratedAgentConfig {
  const voiceGender = knownVoiceGender(profile.providerId, profile.voiceId);
  const avatarGender = knownAvatarGender(profile.avatar);
  if (voiceGender && avatarGender && voiceGender !== avatarGender) {
    throw new ClassroomCastingError(
      'La voix et l’avatar du formateur historique sont incompatibles.',
    );
  }
  const gender = voiceGender ?? avatarGender;
  return {
    id: 'legacy-professor',
    name: profile.name,
    role: 'teacher',
    persona: 'Formateur principal hérité de la classroom.',
    avatar: profile.avatar,
    color: '#3b82f6',
    priority: 10,
    interactionWeight: 100,
    mechanismId: 'professor',
    ...(gender ? { gender } : {}),
    voiceConfig: { providerId: profile.providerId, voiceId: profile.voiceId },
  };
}

export function teacherProfileFromClassroomCast(
  agents: readonly GeneratedAgentConfig[],
): TeacherProfile {
  const teachers = agents.filter((agent) => agent.role === 'teacher');
  if (teachers.length === 0) {
    throw new ClassroomCastingError('La classroom ne possède aucun professeur vocal persistant.');
  }
  if (teachers.length !== 1) {
    throw new ClassroomCastingError(
      'La classroom doit posséder exactement un professeur principal.',
    );
  }
  return profileFromTeacher(normalizedAgent(teachers[0]));
}

/**
 * Return one immutable casting snapshot for every classroom consumer.
 * A complete historical teacher profile is promoted to a one-person cast;
 * classrooms with no trustworthy persisted identity deliberately return null.
 */
export function normalizeClassroomCasting(
  stage: Stage,
  scenes: readonly Scene[],
): CanonicalClassroomCasting | null {
  let changed = false;
  let agents = (stage.generatedAgentConfigs ?? []).map((agent) => {
    const normalized = normalizedAgent(agent);
    if (normalized !== agent) changed = true;
    return normalized;
  });

  if (agents.length === 0) {
    if (!stage.teacherProfile) return null;
    agents = [legacyTeacher(stage.teacherProfile)];
    changed = true;
  }

  const teachers = agents.filter((agent) => agent.role === 'teacher');
  if (teachers.length !== 1) {
    throw new ClassroomCastingError(
      'La classroom doit posséder exactement un professeur principal.',
    );
  }
  const teacher = teachers[0];
  const teacherProfile = profileFromTeacher(teacher);
  if (!profilesEqual(stage.teacherProfile, teacherProfile)) changed = true;

  const agentIds = new Set(agents.map((agent) => agent.id));
  const normalizedScenes = scenes.map((scene) => {
    let sceneChanged = false;
    const actions = scene.actions?.map((action) => {
      if (action.type !== 'speech') return action;
      if (!action.agentId || action.agentId === 'teacher-id') {
        sceneChanged = true;
        return { ...action, agentId: teacher.id };
      }
      if (!agentIds.has(action.agentId)) {
        throw new ClassroomCastingError(
          `La prise de parole ${action.id} référence l’agent inconnu ${action.agentId}.`,
        );
      }
      return action;
    });
    if (!sceneChanged) return scene;
    changed = true;
    return { ...scene, actions };
  });

  return {
    stage: {
      ...stage,
      teacherProfile,
      generatedAgentConfigs: agents,
    },
    scenes: normalizedScenes,
    teacherProfile,
    agents,
    changed,
  };
}
