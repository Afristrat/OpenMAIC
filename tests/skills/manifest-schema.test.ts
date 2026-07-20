import { describe, expect, it } from 'vitest';
import { parseSkillManifest } from '@/lib/skills/manifest-schema';

function manifest(): Record<string, unknown> {
  return {
    id: 'marketing-practice',
    name: { 'fr-FR': 'Marketing pratique' },
    description: { 'fr-FR': 'Un skill de test.' },
    category: 'domain',
    version: '1.0.0',
    author: 'Qalem',
    agents: [
      {
        id: 'coach',
        name: { 'fr-FR': 'Nadia' },
        role: 'teacher',
        persona: { 'fr-FR': 'Guide les apprenants par la pratique.' },
        avatar: '👩',
        color: '#2563eb',
        priority: 8,
        allowedActions: ['spotlight'],
      },
    ],
    promptOverrides: [
      {
        promptId: 'slide-content',
        systemPromptAppend: 'Privilégie les cas réels.',
        variables: {},
      },
    ],
    classroomTemplates: [
      {
        id: 'atelier',
        name: { 'fr-FR': 'Atelier' },
        description: { 'fr-FR': 'Cas pratique.' },
        requirement: 'Créer un atelier marketing.',
        agentIds: ['coach'],
        language: 'fr-FR',
      },
    ],
    sceneDefaults: {},
    requiredProviders: [],
    supportedLanguages: ['fr-FR'],
  };
}

describe('parseSkillManifest', () => {
  it('accepts a bounded inline tenant skill manifest', () => {
    const result = parseSkillManifest(manifest());
    expect(result.success).toBe(true);
  });

  it('rejects file references because tenant manifests have no filesystem', () => {
    const value = manifest();
    value.promptOverrides = [
      { promptId: 'slide-content', systemPromptAppend: 'file:prompt.md', variables: {} },
    ];
    const result = parseSkillManifest(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('file references');
  });

  it('rejects prompt identifiers that the generation engine does not expose', () => {
    const value = manifest();
    value.promptOverrides = [
      { promptId: 'invented-prompt', systemPromptAppend: 'Test', variables: {} },
    ];
    const result = parseSkillManifest(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('unknown promptId');
  });

  it('rejects templates that reference a missing agent', () => {
    const value = manifest();
    value.classroomTemplates = [
      {
        id: 'atelier',
        name: { 'fr-FR': 'Atelier' },
        description: { 'fr-FR': 'Cas pratique.' },
        requirement: 'Créer un atelier marketing.',
        agentIds: ['absent'],
        language: 'fr-FR',
      },
    ];
    const result = parseSkillManifest(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('unknown agentId');
  });
});
