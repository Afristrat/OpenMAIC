import { describe, expect, test } from 'vitest';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { AICallFn } from '@/lib/generation/pipeline-types';

describe('media prompt condition wiring', () => {
  test('outline generation passes media enable flags into conditional snippets', async () => {
    let capturedPrompt = '';
    const aiCall: AICallFn = async (system, user) => {
      capturedPrompt = `${system}\n${user}`;
      return JSON.stringify({
        languageDirective: 'Teach in English.',
        courseTitle: 'Evaporation',
        outlines: [],
      });
    };

    const requirements: UserRequirements = {
      requirement: 'Teach evaporation with an animation',
    };

    const result = await generateSceneOutlinesFromRequirements(
      requirements,
      undefined,
      undefined,
      aiCall,
      undefined,
      { imageGenerationEnabled: false, videoGenerationEnabled: true },
    );

    expect(result.success).toBe(true);
    expect(capturedPrompt).toContain('gen_vid_1');
    expect(capturedPrompt).not.toContain('gen_img_');
    expect(capturedPrompt).not.toContain('suggestedImageIds');
    expect(capturedPrompt).not.toContain('{{');
  });

  test('slide content generation exposes only media element rules backed by outline media', async () => {
    let capturedPrompt = '';
    const aiCall: AICallFn = async (system, user) => {
      capturedPrompt = `${system}\n${user}`;
      return JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'title',
            type: 'text',
            left: 60,
            top: 80,
            width: 880,
            height: 76,
            content: '<p style="font-size: 28px;">Evaporation</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });
    };

    const outline: SceneOutline = {
      id: 'scene_1',
      type: 'slide',
      title: 'Evaporation Motion',
      description: 'Explain evaporation as a moving process',
      keyPoints: ['Molecules gain energy', 'Water changes into vapor'],
      order: 1,
      mediaGenerations: [
        {
          type: 'video',
          prompt: 'Animation of water molecules evaporating',
          elementId: 'gen_vid_unique1',
          aspectRatio: '16:9',
        },
      ],
    };

    const result = await generateSceneContent(outline, aiCall);

    expect(result).not.toBeNull();
    expect(capturedPrompt).toContain('VideoElement');
    expect(capturedPrompt).toContain('mediaRef');
    expect(capturedPrompt).toContain('gen_vid_unique1');
    expect(capturedPrompt).not.toContain('"src": "gen_vid_1"');
    expect(capturedPrompt).not.toContain('ImageElement');
    expect(capturedPrompt).not.toContain('gen_img_');
    expect(capturedPrompt).not.toContain('{{');
  });

  test('resolves semantic QR image IDs used by generated learning resources', async () => {
    const qrImageUrl = '/api/classroom-media/classroom-1/resources/resource_1-qr.png';
    const downloadUrl = 'https://qalem.ma/A7bK2';
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'resource-qr',
            type: 'image',
            src: 'qr_resource_1',
            left: 620,
            top: 120,
            width: 260,
            height: 260,
          },
          {
            id: 'resource-link',
            type: 'text',
            left: 80,
            top: 120,
            width: 480,
            height: 160,
            content: `<p>${downloadUrl}</p>`,
            defaultFontName: '',
            defaultColor: '#111111',
          },
        ],
      });
    const outline: SceneOutline = {
      id: 'resource-scene',
      type: 'slide',
      title: 'Téléchargez le classeur',
      description: 'Mettre le fichier à disposition',
      keyPoints: ['Scanner le QR code', 'Télécharger le fichier'],
      order: 1,
      generatedResources: [
        {
          id: 'resource_1',
          format: 'xlsx',
          title: 'Budget de trésorerie',
          fileName: 'budget-tresorerie.xlsx',
          downloadUrl,
          qrImageUrl,
        },
      ],
    };

    const result = await generateSceneContent(outline, aiCall, {
      assignedImages: [
        {
          id: 'qr_resource_1',
          src: qrImageUrl,
          pageNumber: 0,
          width: 320,
          height: 320,
          description: 'QR code du classeur',
        },
      ],
      imageMapping: { qr_resource_1: qrImageUrl },
    });

    expect(result).not.toBeNull();
    if (!result || !('elements' in result)) {
      throw new Error('Expected generated slide content');
    }
    expect(result.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image', src: qrImageUrl })]),
    );
  });

  test('rejects an invented third-party URL even when the expected Qalem link is present', async () => {
    const downloadUrl = 'https://qalem.ma/A7bK2';
    const qrImageUrl = '/api/classroom-media/classroom-1/resources/resource_1-qr.png';
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        elements: [
          {
            id: 'resource-qr',
            type: 'image',
            src: 'qr_resource_1',
            left: 620,
            top: 120,
            width: 260,
            height: 260,
          },
          {
            id: 'resource-link',
            type: 'text',
            left: 80,
            top: 120,
            width: 480,
            height: 160,
            content: `<p>${downloadUrl}</p><p>https://cours.tpe-treso.ma/budget</p>`,
            defaultFontName: '',
            defaultColor: '#111111',
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'resource-scene',
        type: 'slide',
        title: 'Téléchargez le classeur',
        description: 'Mettre le fichier à disposition',
        keyPoints: ['Télécharger le fichier'],
        order: 1,
        generatedResources: [
          {
            id: 'resource_1',
            format: 'xlsx',
            title: 'Budget de trésorerie',
            fileName: 'budget-tresorerie.xlsx',
            downloadUrl,
            qrImageUrl,
          },
        ],
      },
      aiCall,
      {
        assignedImages: [
          {
            id: 'qr_resource_1',
            src: qrImageUrl,
            pageNumber: 0,
            width: 320,
            height: 320,
            description: 'QR code du classeur',
          },
        ],
        imageMapping: { qr_resource_1: qrImageUrl },
      },
    );

    expect(result).toBeNull();
  });
});

describe('outline courseTitle parsing', () => {
  const baseRequirements: UserRequirements = { requirement: 'Teach photosynthesis' };

  async function runWith(raw: unknown) {
    const aiCall: AICallFn = async (_system, _user) => JSON.stringify(raw);
    return generateSceneOutlinesFromRequirements(baseRequirements, undefined, undefined, aiCall);
  }

  test('adopts a string courseTitle from the wrapper object', async () => {
    const result = await runWith({
      languageDirective: 'Teach in English.',
      courseTitle: 'Photosynthesis Basics',
      outlines: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.courseTitle).toBe('Photosynthesis Basics');
  });

  test('trims whitespace and caps overlong courseTitle defensively', async () => {
    const long = 'A '.repeat(80); // 160 chars
    const result = await runWith({
      languageDirective: 'Teach in English.',
      courseTitle: `  ${long}  `,
      outlines: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.courseTitle?.length).toBeLessThanOrEqual(120);
    // trimmed
    expect(result.data?.courseTitle?.startsWith(' ')).toBe(false);
  });

  test('returns an explicit author-confirmation placeholder when courseTitle is missing', async () => {
    const result = await runWith({
      languageDirective: 'Teach in English.',
      outlines: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.courseTitle).toBe('To be confirmed by the author');
    expect(result.data?.syllabus.learningObjectives).toEqual([
      'To be confirmed by the author',
    ]);
  });

  test('replaces a non-string or empty courseTitle with an explicit placeholder', async () => {
    const result = await runWith({
      languageDirective: 'Teach in English.',
      courseTitle: '   ',
      outlines: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.courseTitle).toBe('To be confirmed by the author');
  });

  test('preserves a complete syllabus proposed for author approval', async () => {
    const syllabus = {
      audience: 'Store managers',
      prerequisites: 'No prerequisite',
      overallObjective: 'Prevent till discrepancies',
      learningObjectives: ['Identify a discrepancy'],
      totalDurationMinutes: 45,
      deliveryMode: 'Interactive virtual classroom',
      assessmentStrategy: 'Observed case resolution',
      expectedDeliverable: 'Completed closing checklist',
    };
    const result = await runWith({
      languageDirective: 'Teach in English.',
      courseTitle: 'Till closing',
      syllabus,
      outlines: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.syllabus).toEqual(syllabus);
  });
});
