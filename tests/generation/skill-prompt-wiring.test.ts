import { describe, expect, it } from 'vitest';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

const SKILL_ID = 'formation-design-pro';
const OVERRIDE_SENTINEL = 'Formation Design Pro — Conditional Andragogy Override';

describe('skill prompt wiring', () => {
  const requirements: UserRequirements = {
    requirement: 'Former des responsables aux entretiens difficiles',
    activeSkillId: SKILL_ID,
  };

  it('changes both outline and scene prompts when the skill engine is enabled', async () => {
    let outlineSystem = '';
    const outlineCall: AICallFn = async (system) => {
      outlineSystem = system;
      return JSON.stringify({ languageDirective: 'Répondre en français.', outlines: [] });
    };

    await generateSceneOutlinesFromRequirements(
      requirements,
      undefined,
      undefined,
      outlineCall,
      undefined,
      { skillEngineEnabled: true },
    );

    let sceneSystem = '';
    const sceneCall: AICallFn = async (system) => {
      sceneSystem = system;
      return JSON.stringify({ elements: [], background: null, remark: '' });
    };
    const outline: SceneOutline = {
      id: 'scene-1',
      type: 'slide',
      title: 'Conduire l’entretien',
      description: 'Une mise en situation professionnelle.',
      keyPoints: ['Préparer', 'Écouter', 'Conclure'],
      order: 1,
    };

    await generateSceneContent(outline, sceneCall, {
      skillEngineEnabled: true,
      activeSkillId: SKILL_ID,
    });

    expect(outlineSystem).toContain(OVERRIDE_SENTINEL);
    expect(sceneSystem).toContain(OVERRIDE_SENTINEL);
  });

  it('keeps both prompts unchanged when the skill engine is disabled', async () => {
    let outlineSystem = '';
    const outlineCall: AICallFn = async (system) => {
      outlineSystem = system;
      return JSON.stringify({ languageDirective: 'Répondre en français.', outlines: [] });
    };
    await generateSceneOutlinesFromRequirements(
      requirements,
      undefined,
      undefined,
      outlineCall,
      undefined,
      { skillEngineEnabled: false },
    );

    let sceneSystem = '';
    const sceneCall: AICallFn = async (system) => {
      sceneSystem = system;
      return JSON.stringify({ elements: [], background: null, remark: '' });
    };
    await generateSceneContent(
      {
        id: 'scene-1',
        type: 'slide',
        title: 'Conduire l’entretien',
        description: 'Une mise en situation professionnelle.',
        keyPoints: ['Préparer'],
        order: 1,
      },
      sceneCall,
      { skillEngineEnabled: false, activeSkillId: SKILL_ID },
    );

    expect(outlineSystem).not.toContain(OVERRIDE_SENTINEL);
    expect(sceneSystem).not.toContain(OVERRIDE_SENTINEL);
  });
});
