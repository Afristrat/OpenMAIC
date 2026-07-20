'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import {
  PERSONA_CATALOG,
  approachForAudience,
  type AgentGender,
  type AudienceStage,
  type ExpertiseLevel,
  type InteractionLevel,
  type LearningDesignSettings,
} from '@/lib/agents/persona-catalog';

interface AgentRosterSettingsProps {
  value: LearningDesignSettings;
  onChange: (value: LearningDesignSettings) => void;
  managedTtsIds: string[];
  t: (key: string) => string;
}

export function AgentRosterSettings({
  value,
  onChange,
  managedTtsIds,
  t,
}: AgentRosterSettingsProps): React.ReactElement {
  const updatePersona = (
    personaId: string,
    updates: Partial<LearningDesignSettings['personas'][number]>,
  ) => {
    onChange({
      ...value,
      personas: value.personas.map((persona) =>
        persona.id === personaId ? { ...persona, ...updates } : persona,
      ),
    });
  };

  const compatibleVoices = (providerId: string, gender: AgentGender) =>
    (TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS]?.voices ?? []).filter(
      (voice) => voice.gender === gender || voice.gender === 'neutral',
    );

  const setGender = (personaId: string, gender: AgentGender) => {
    const persona = value.personas.find((item) => item.id === personaId);
    if (!persona) return;
    const avatars = PERSONA_CATALOG.filter((item) => item.gender === gender).map(
      (item) => item.avatar,
    );
    const voices = compatibleVoices(persona.providerId, gender);
    updatePersona(personaId, {
      gender,
      avatar: avatars.includes(persona.avatar) ? persona.avatar : avatars[0],
      voiceId: voices.some((voice) => voice.id === persona.voiceId)
        ? persona.voiceId
        : (voices[0]?.id ?? persona.voiceId),
    });
  };

  return (
    <div className="sm:col-span-2 border-t pt-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ConfigSelect
          label={t('org.audienceStage')}
          value={value.audienceStage}
          options={['child', 'adolescent', 'higher-education', 'adult-professional']}
          optionLabel={(option) => t(`org.audienceStages.${option}`)}
          onChange={(audienceStage) =>
            onChange({ ...value, audienceStage: audienceStage as AudienceStage })
          }
        />
        <ConfigSelect
          label={t('org.expertiseLevel')}
          value={value.expertiseLevel}
          options={['beginner', 'intermediate', 'advanced']}
          optionLabel={(option) => t(`org.expertiseLevels.${option}`)}
          onChange={(expertiseLevel) =>
            onChange({ ...value, expertiseLevel: expertiseLevel as ExpertiseLevel })
          }
        />
        <ConfigSelect
          label={t('org.interactionLevel')}
          value={value.interactionLevel}
          options={['guided', 'balanced', 'immersive']}
          optionLabel={(option) => t(`org.interactionLevels.${option}`)}
          onChange={(interactionLevel) =>
            onChange({ ...value, interactionLevel: interactionLevel as InteractionLevel })
          }
        />
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          {t(`org.learningApproaches.${approachForAudience(value.audienceStage)}`)}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm font-semibold">{t('org.agentRoster')}</p>
        <p className="text-xs text-muted-foreground">{t('org.agentRosterHint')}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {value.personas.map((persona, index) => {
          const avatarChoices = PERSONA_CATALOG.filter(
            (candidate) => candidate.gender === persona.gender,
          ).map((candidate) => candidate.avatar);
          const voices = compatibleVoices(persona.providerId, persona.gender);
          return (
            <article key={persona.id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-3">
                <img src={persona.avatar} alt="" className="size-14 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`landing.classroom.agent${index + 1}Name`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`settings.agentRoles.${persona.role}`)}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t('org.agentFirstName')}</FieldLabel>
                  <Input
                    value={persona.defaultName}
                    onChange={(event) =>
                      updatePersona(persona.id, { defaultName: event.target.value })
                    }
                  />
                </div>
                <div>
                  <FieldLabel>{t('org.agentGender')}</FieldLabel>
                  <Select
                    value={persona.gender}
                    onValueChange={(gender) => setGender(persona.id, gender as AgentGender)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">{t('org.genders.female')}</SelectItem>
                      <SelectItem value="male">{t('org.genders.male')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>{t('org.agentAvatar')}</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {avatarChoices.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        aria-label={t('org.agentAvatar')}
                        onClick={() => updatePersona(persona.id, { avatar })}
                        className={`size-10 overflow-hidden rounded-full border-2 ${persona.avatar === avatar ? 'border-primary' : 'border-transparent'}`}
                      >
                        <img src={avatar} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>{t('org.teacherVoiceProvider')}</FieldLabel>
                  <Select
                    value={persona.providerId}
                    onValueChange={(providerId) => {
                      const nextVoices = compatibleVoices(providerId, persona.gender);
                      updatePersona(persona.id, {
                        providerId: providerId as typeof persona.providerId,
                        voiceId: nextVoices[0]?.id ?? persona.voiceId,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {managedTtsIds
                        .filter((id) => compatibleVoices(id, persona.gender).length > 0)
                        .map((id) => (
                          <SelectItem key={id} value={id}>
                            {TTS_PROVIDERS[id as keyof typeof TTS_PROVIDERS]?.name ?? id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>{t('org.teacherVoice')}</FieldLabel>
                  <Select
                    value={persona.voiceId}
                    onValueChange={(voiceId) => updatePersona(persona.id, { voiceId })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>{t('org.agentPersona')}</FieldLabel>
                  <textarea
                    value={persona.persona}
                    onChange={(event) => updatePersona(persona.id, { persona: event.target.value })}
                    rows={3}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                  {(['guided', 'balanced', 'immersive'] as const).map((level) => (
                    <div key={level}>
                      <FieldLabel>{t(`org.interactionLevels.${level}`)} (%)</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={persona.interactionWeights[level]}
                        onChange={(event) =>
                          updatePersona(persona.id, {
                            interactionWeights: {
                              ...persona.interactionWeights,
                              [level]: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <label className="mb-1 block text-xs font-medium">{children}</label>;
}

function ConfigSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabel: (option: string) => string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="min-w-48 flex-1">
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
