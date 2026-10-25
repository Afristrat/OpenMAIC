import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { PERSONA_CATALOG } from '@/lib/agents/persona-catalog';
import { HIGGS_QUALIFIED_VOICE_CATALOG } from '@/lib/audio/qualified-voice-catalog';
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

export interface TeacherVoiceConfig {
  providerId: string;
  modelId?: string;
  voiceId: string;
  voiceName?: string;
  gender?: 'female' | 'male' | 'neutral';
}

/** The author's teacher choice (voice, first name, gender) applied to the roster's teacher. */
export function applyTeacherVoiceConfig<T extends GeneratedAgentConfig>(
  agents: T[],
  config?: TeacherVoiceConfig,
): T[] {
  if (!config) return agents;
  return agents.map((agent) => {
    if (agent.role !== 'teacher') return agent;
    const gender =
      config.gender === 'female' || config.gender === 'male' ? config.gender : agent.gender;
    return {
      ...agent,
      ...(config.voiceName ? { name: config.voiceName } : {}),
      gender,
      avatar:
        gender === 'female'
          ? '/avatars/teacher-2.png'
          : gender === 'male'
            ? '/avatars/teacher.png'
            : agent.avatar,
      voiceConfig: {
        providerId: config.providerId as TTSProviderId,
        ...(config.modelId ? { modelId: config.modelId } : {}),
        voiceId: config.voiceId,
      },
    };
  });
}

const sameName = (left: string, right: string): boolean =>
  left.trim().toLocaleLowerCase('fr') === right.trim().toLocaleLowerCase('fr');

/**
 * No two agents of a casting share a first name or a voice. The teacher chosen by the author wins:
 * an agent that collides with it moves to a free qualified voice of the SAME gender, takes that
 * voice's first name and, when a free one exists, an avatar of that gender. Without any free voice
 * the casting fails loudly rather than shipping a silent duplicate.
 */
export function ensureDistinctCasting<T extends GeneratedAgentConfig>(agents: T[]): T[] {
  const teacher = agents.find((agent) => agent.role === 'teacher');
  if (!teacher?.voiceConfig) return agents;
  const voiceKey = (agent: T) =>
    agent.voiceConfig ? `${agent.voiceConfig.providerId}:${agent.voiceConfig.voiceId}` : '';
  const collides = (agent: T) =>
    agent !== teacher &&
    (sameName(agent.name, teacher.name) || voiceKey(agent) === voiceKey(teacher));
  if (!agents.some(collides)) return agents;

  const taken = new Set(agents.filter((agent) => !collides(agent)).map(voiceKey));
  const takenNames = agents.filter((agent) => !collides(agent)).map((agent) => agent.name);
  const takenAvatars = new Set(agents.filter((agent) => !collides(agent)).map((a) => a.avatar));
  const result = [...agents];
  for (const [index, agent] of agents.entries()) {
    if (!collides(agent)) continue;
    const gender =
      agent.gender ??
      (agent.voiceConfig &&
        knownVoiceGender(agent.voiceConfig.providerId, agent.voiceConfig.voiceId)) ??
      knownAvatarGender(agent.avatar);
    const free = HIGGS_QUALIFIED_VOICE_CATALOG.find(
      (voice) =>
        voice.gender === gender &&
        !taken.has(`${voice.providerId}:${voice.id}`) &&
        !takenNames.some((name) => sameName(name, voice.name)),
    );
    if (!gender || !free) {
      throw new ClassroomCastingError(
        `Aucune voix libre de même genre pour l’agent ${agent.id} : le professeur « ${teacher.name} » occupe déjà son nom ou sa voix.`,
      );
    }
    const avatar =
      PERSONA_CATALOG.find(
        (persona) => persona.gender === gender && !takenAvatars.has(persona.avatar),
      )?.avatar ?? agent.avatar;
    taken.add(`${free.providerId}:${free.id}`);
    takenNames.push(free.name);
    takenAvatars.add(avatar);
    result[index] = {
      ...agent,
      name: free.name,
      gender,
      avatar,
      voiceConfig: { providerId: free.providerId, voiceId: free.id },
    };
  }
  return result;
}

/**
 * Names of the catalogue personas that a line speaks although no agent of the casting bears them:
 * the sign of a prompt written with a roster different from the persisted one.
 */
export function findForeignPersonaNames(
  text: string,
  agents: readonly Pick<GeneratedAgentConfig, 'name'>[],
): string[] {
  const known = new Set([
    ...PERSONA_CATALOG.map((persona) => persona.defaultName),
    ...HIGGS_QUALIFIED_VOICE_CATALOG.map((voice) => voice.name),
  ]);
  return [...known].filter(
    (name) =>
      !agents.some((agent) => sameName(agent.name, name)) &&
      new RegExp(`(?<![\p{L}])${name}(?![\p{L}])`, 'u').test(text),
  );
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
