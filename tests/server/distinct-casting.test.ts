import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyTeacherVoiceConfig,
  ClassroomCastingError,
  ensureDistinctCasting,
  findForeignPersonaNames,
} from '@/lib/agents/classroom-casting';
import { PERSONA_CATALOG } from '@/lib/agents/persona-catalog';
import { HIGGS_QUALIFIED_VOICE_CATALOG } from '@/lib/audio/qualified-voice-catalog';
import type { GeneratedAgentConfig } from '@/lib/types/stage';

const roster = (): GeneratedAgentConfig[] =>
  PERSONA_CATALOG.map((persona) => ({
    id: `persona-${persona.id}`,
    name: persona.defaultName,
    role: persona.role,
    persona: persona.persona,
    avatar: persona.avatar,
    color: persona.color,
    priority: 5,
    gender: persona.gender,
    voiceConfig: { providerId: persona.providerId, voiceId: persona.voiceId },
  }));

const choose = (voice: (typeof HIGGS_QUALIFIED_VOICE_CATALOG)[number]) =>
  ensureDistinctCasting(
    applyTeacherVoiceConfig(roster(), {
      providerId: 'higgs-tts',
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
    }),
  );

describe('casting distinct', () => {
  it('renomme le professeur selon le choix de l’auteur, que les prompts doivent voir', () => {
    const cast = choose(HIGGS_QUALIFIED_VOICE_CATALOG[0]);
    expect(cast.find((agent) => agent.role === 'teacher')?.name).toBe('Hanae');
  });

  it('réaffecte la coach quand le professeur prend la voix hanae', () => {
    const cast = choose(HIGGS_QUALIFIED_VOICE_CATALOG[0]);
    const coach = cast.find((agent) => agent.id === 'persona-coach');
    expect(coach).toMatchObject({ name: 'Sana', gender: 'female' });
    expect(coach?.voiceConfig).toEqual({ providerId: 'higgs-tts', voiceId: 'sana' });
  });

  it.each(HIGGS_QUALIFIED_VOICE_CATALOG.map((voice) => [voice.id, voice] as const))(
    'professeur %s : ni nom ni voix en double, genres cohérents',
    (_id, voice) => {
      const cast = choose(voice);
      const names = cast.map((agent) => agent.name.toLowerCase());
      const voices = cast.map((agent) => agent.voiceConfig?.voiceId);
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(voices).size).toBe(voices.length);
      for (const agent of cast) {
        const catalogVoice = HIGGS_QUALIFIED_VOICE_CATALOG.find(
          (entry) => entry.id === agent.voiceConfig?.voiceId,
        );
        if (catalogVoice) expect(catalogVoice.gender).toBe(agent.gender);
        const avatarGender = PERSONA_CATALOG.find((p) => p.avatar === agent.avatar)?.gender;
        expect(avatarGender).toBe(agent.gender);
      }
    },
  );

  it('échoue explicitement quand aucune voix libre du même genre n’existe', () => {
    const cast = applyTeacherVoiceConfig(roster(), {
      providerId: 'higgs-tts',
      voiceId: 'sana',
      voiceName: 'Salma',
      gender: 'female',
    });
    // Toutes les voix féminines qualifiées sont prises sauf hanae, libérée par personne : on la retire.
    const crowded = cast.map((agent) =>
      agent.id === 'persona-coach'
        ? { ...agent, voiceConfig: { providerId: 'higgs-tts' as const, voiceId: 'rim' } }
        : agent,
    );
    expect(() => ensureDistinctCasting(crowded)).toThrow(ClassroomCastingError);
  });

  it('laisse intact un casting sans collision', () => {
    const cast = roster();
    expect(ensureDistinctCasting(cast)).toBe(cast);
  });
});

describe('findForeignPersonaNames', () => {
  const cast = [{ name: 'Hanae' }, { name: 'Sana' }];

  it('signale un prénom de catalogue absent du casting', () => {
    expect(findForeignPersonaNames('Je suis Younes, votre enseignant.', cast)).toEqual(['Younes']);
  });

  it('ne signale pas les prénoms du casting ni les mots ordinaires', () => {
    expect(findForeignPersonaNames('Hanae, merci. Sana répond.', cast)).toEqual([]);
    expect(findForeignPersonaNames('Une question concrète.', cast)).toEqual([]);
  });
});

describe('génération', () => {
  it('dérive la liste d’agents des prompts APRÈS les surcharges et le casting distinct', () => {
    const source = readFileSync('lib/server/classroom-generation.ts', 'utf8');
    const derive = source.indexOf('const agents: AgentInfo[] = tenantAgentConfigs.map(');
    expect(derive).toBeGreaterThan(source.indexOf('applyTeacherVoiceConfig(tenantAgentConfigs'));
    expect(derive).toBeGreaterThan(source.indexOf('ensureDistinctCasting(tenantAgentConfigs'));
    expect(source.match(/agents: AgentInfo\[\] = tenantAgentConfigs\.map\(/g)).toHaveLength(1);
  });
});
