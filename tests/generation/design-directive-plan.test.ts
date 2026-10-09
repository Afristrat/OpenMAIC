import { describe, expect, it } from 'vitest';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { DEFAULT_DESIGN_DIRECTIVE } from '@/lib/branding/design-directive';
import type { AICallFn } from '@/lib/generation/pipeline-types';

const response = {
  languageDirective: 'Teach in English.',
  courseTitle: 'Industrial safety',
  designDirective: DEFAULT_DESIGN_DIRECTIVE,
  syllabus: {
    audience: 'Industrial operators',
    prerequisites: 'None',
    overallObjective: 'Apply the safety procedure.',
    learningObjectives: ['Identify hazards'],
    totalDurationMinutes: 15,
    deliveryMode: 'Asynchronous',
    assessmentStrategy: 'Scenario response',
    expectedDeliverable: 'A completed checklist',
  },
  outlines: [
    {
      id: 'scene-1',
      type: 'slide',
      title: 'Hazard review',
      description: 'Identify the main hazards.',
      keyPoints: ['Stop', 'Assess'],
      order: 1,
    },
  ],
};

describe('design directive in course planning', () => {
  it('requests a closed-enum directive and returns the validated model choice', async () => {
    let userPrompt = '';
    const aiCall: AICallFn = async (_system, user) => {
      userPrompt = user;
      return JSON.stringify(response);
    };

    const result = await generateSceneOutlinesFromRequirements(
      { requirement: 'Create a short industrial safety course for adult operators.' },
      undefined,
      undefined,
      aiCall,
      undefined,
      { designSystemEnabled: true },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.designDirective).toEqual(DEFAULT_DESIGN_DIRECTIVE);
    expect(userPrompt).toContain('designDirective');
    expect(userPrompt).toContain('Industrial safety');
    expect(userPrompt).toContain('Finance for executives');
    expect(userPrompt).toContain('Relational skills');
  });

  it('uses the neutral default when an opted-in model omits the directive', async () => {
    const { designDirective: _ignored, ...responseWithoutDirective } = response;
    void _ignored;
    const aiCall: AICallFn = async () => JSON.stringify(responseWithoutDirective);

    const result = await generateSceneOutlinesFromRequirements(
      { requirement: 'Create a short industrial safety course for adult operators.' },
      undefined,
      undefined,
      aiCall,
      undefined,
      { designSystemEnabled: true },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.designDirective).toEqual(DEFAULT_DESIGN_DIRECTIVE);
  });

  it('preserves the legacy bare-array response without inventing a directive', async () => {
    const aiCall: AICallFn = async () =>
      JSON.stringify([
        {
          id: 'scene-1',
          type: 'slide',
          title: 'Legacy plan',
          description: 'A legacy outline.',
          keyPoints: ['Point'],
          order: 1,
        },
      ]);

    const result = await generateSceneOutlinesFromRequirements(
      { requirement: 'Explain the topic.' },
      undefined,
      undefined,
      aiCall,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.designDirective).toBeUndefined();
  });

  it('keeps the design direction out of prompts when the tenant flag is off', async () => {
    let userPrompt = '';
    const aiCall: AICallFn = async (_system, user) => {
      userPrompt = user;
      return JSON.stringify(response);
    };

    const result = await generateSceneOutlinesFromRequirements(
      { requirement: 'Create a short industrial safety course for adult operators.' },
      undefined,
      undefined,
      aiCall,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.designDirective).toBeUndefined();
    expect(userPrompt).not.toContain('### Design direction');
    expect(userPrompt).not.toContain('"designDirective"');
    expect(userPrompt).toContain('exactly four top-level keys');
  });
});
