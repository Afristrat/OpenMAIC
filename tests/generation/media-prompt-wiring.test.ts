import { describe, expect, test, vi } from 'vitest';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import {
  findUnreadableTextualLatexIssue,
  generateSceneContent,
  hasUnexpectedLearnerUrl,
} from '@/lib/generation/scene-generator';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { AICallFn } from '@/lib/generation/pipeline-types';

describe('media prompt condition wiring', () => {
  test('rejects prose-heavy French text rendered as a tiny LaTeX formula', () => {
    expect(
      findUnreadableTextualLatexIssue([
        {
          id: 'formula',
          type: 'latex',
          left: 0,
          top: 0,
          width: 180,
          height: 60,
          latex: '\\text{Solde} = \\text{Encaissements} - \\text{Décaissements}',
        },
      ]),
    ).toContain('normal HTML text element');
  });

  test('keeps compact symbolic formulas in LaTeX', () => {
    expect(
      findUnreadableTextualLatexIssue([
        {
          id: 'formula',
          type: 'latex',
          left: 0,
          top: 0,
          width: 180,
          height: 60,
          latex: 'S = E - D',
        },
      ]),
    ).toBeNull();
  });

  test('makes an attached document primary and web research secondary', async () => {
    let capturedPrompt = '';
    const aiCall: AICallFn = async (system, user) => {
      capturedPrompt = `${system}\n${user}`;
      return JSON.stringify({
        languageDirective: 'Teach in English.',
        courseTitle: 'Source-grounded course',
        outlines: [],
      });
    };

    await generateSceneOutlinesFromRequirements(
      { requirement: 'Create a course based on the attached document.' },
      'PRIMARY SOURCE CONTENT',
      undefined,
      aiCall,
      undefined,
      { researchContext: 'SECONDARY WEB CONTENT' },
    );

    expect(capturedPrompt).toContain('attached document is the primary source');
    expect(capturedPrompt).toContain('Web results are secondary');
    expect(capturedPrompt.indexOf('PRIMARY SOURCE CONTENT')).toBeLessThan(
      capturedPrompt.indexOf('SECONDARY WEB CONTENT'),
    );
  });

  test('requires revised Bloom objectives with observable success criteria', async () => {
    let capturedPrompt = '';
    const aiCall: AICallFn = async (system) => {
      capturedPrompt = system;
      return JSON.stringify({
        languageDirective: 'Répondre en français.',
        courseTitle: 'Améliorer un processus',
        syllabus: {
          audience: 'Responsables opérationnels',
          prerequisites: 'Aucun prérequis',
          overallObjective: 'Diagnostiquer un processus et produire un plan mesurable.',
          learningObjectives: ['Analyser les causes de contre-performance.'],
          totalDurationMinutes: 30,
          deliveryMode: 'Classe virtuelle interactive',
          assessmentStrategy: 'Mise en situation observée',
          expectedDeliverable: 'Plan d’action mesurable',
        },
        outlines: [],
      });
    };

    await generateSceneOutlinesFromRequirements(
      { requirement: 'Former à l’amélioration des processus' },
      undefined,
      undefined,
      aiCall,
    );

    expect(capturedPrompt).toContain('revised Bloom taxonomy');
    expect(capturedPrompt).toContain('observable action verb');
    expect(capturedPrompt).toContain('success criterion');
  });

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
          {
            id: 'video',
            type: 'video',
            mediaRef: 'gen_vid_unique1',
            left: 100,
            top: 180,
            width: 800,
            height: 320,
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

  test('rejects a slide that omits a requested generated image', async () => {
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'title',
            type: 'text',
            left: 60,
            top: 80,
            width: 880,
            height: 76,
            content: '<p>Evaporation</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'scene_1',
        type: 'slide',
        title: 'Evaporation',
        description: 'Explain evaporation',
        keyPoints: ['Molecules gain energy'],
        order: 1,
        mediaGenerations: [
          {
            type: 'image',
            prompt: 'Water molecules evaporating',
            elementId: 'gen_img_required',
            aspectRatio: '16:9',
          },
        ],
      },
      aiCall,
    );

    expect(result).toBeNull();
  });

  test('reports every omitted generated medium in one correction', async () => {
    let feedback = '';
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'title',
            type: 'text',
            left: 60,
            top: 80,
            width: 880,
            height: 76,
            content: '<p>Process mapping</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'scene_multiple_media',
        type: 'slide',
        title: 'Process mapping',
        description: 'Compare the current and target process',
        keyPoints: ['Current state', 'Target state'],
        order: 1,
        mediaGenerations: [
          {
            type: 'image',
            prompt: 'Current process map',
            elementId: 'gen_img_current',
            aspectRatio: '16:9',
          },
          {
            type: 'image',
            prompt: 'Target process map',
            elementId: 'gen_img_target',
            aspectRatio: '16:9',
          },
        ],
      },
      aiCall,
      {
        onValidationFailure: (directive) => {
          feedback = directive;
        },
      },
    );

    expect(result).toBeNull();
    expect(feedback).toContain('gen_img_current');
    expect(feedback).toContain('gen_img_target');
  });

  test('rejects a slide that omits every source image selected by the approved outline', async () => {
    let feedback = '';
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'title',
            type: 'text',
            left: 60,
            top: 80,
            width: 880,
            height: 76,
            content: '<p>Process map</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'scene_source_image',
        type: 'slide',
        title: 'Process map',
        description: 'Explain the source diagram',
        keyPoints: ['Read the process map'],
        order: 1,
      },
      aiCall,
      {
        assignedImages: [
          {
            id: 'img_source_1',
            src: '/api/classroom-media/classroom-1/img_source_1.png',
            pageNumber: 2,
            width: 640,
            height: 360,
          },
        ],
        imageMapping: { img_source_1: '/api/classroom-media/classroom-1/img_source_1.png' },
        requiredSourceImageIds: ['img_source_1'],
        onValidationFailure: (directive) => {
          feedback = directive;
        },
      },
    );

    expect(result).toBeNull();
    expect(feedback).toContain('img_source_1');
  });

  test('requires and resolves a source image selected by the approved outline', async () => {
    let capturedPrompt = '';
    const persistedUrl = '/api/classroom-media/classroom-1/img_source_1.png';
    const aiCall: AICallFn = async (_system, user) => {
      capturedPrompt = user;
      return JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'source-image',
            type: 'image',
            src: 'img_source_1',
            left: 520,
            top: 120,
            width: 400,
            height: 300,
          },
        ],
      });
    };

    const result = await generateSceneContent(
      {
        id: 'scene_source_image',
        type: 'slide',
        title: 'Process map',
        description: 'Explain the source diagram',
        keyPoints: ['Read the process map'],
        order: 1,
      },
      aiCall,
      {
        assignedImages: [
          {
            id: 'img_source_1',
            src: persistedUrl,
            pageNumber: 2,
            width: 640,
            height: 360,
          },
        ],
        imageMapping: { img_source_1: persistedUrl },
        requiredSourceImageIds: ['img_source_1'],
      },
    );

    expect(capturedPrompt).toContain('REQUIRED SOURCE IMAGE');
    expect(capturedPrompt).toContain('img_source_1');
    expect(capturedPrompt).toContain('two-column composition');
    expect(capturedPrompt).toContain('x=560, y=150, width=380, height=300');
    expect(capturedPrompt).toContain('Do not add a table, chart, or another media element');
    expect(result).not.toBeNull();
    if (!result || !('elements' in result)) {
      throw new Error('Expected generated slide content');
    }
    expect(result.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image', src: persistedUrl })]),
    );
  });

  test('fits a portrait source image inside the authored box without pushing it out of bounds', async () => {
    const persistedUrl = '/api/classroom-media/classroom-1/portrait.png';
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        background: { type: 'solid', color: '#ffffff' },
        elements: [
          {
            id: 'source-image',
            type: 'image',
            src: 'img_portrait',
            left: 560,
            top: 150,
            width: 380,
            height: 300,
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'scene_portrait_source',
        type: 'slide',
        title: 'Portrait source',
        description: 'Keep the portrait inside the slide',
        keyPoints: ['Respect the source ratio'],
        order: 1,
      },
      aiCall,
      {
        assignedImages: [
          {
            id: 'img_portrait',
            src: persistedUrl,
            pageNumber: 2,
            width: 1000,
            height: 2000,
          },
        ],
        imageMapping: { img_portrait: persistedUrl },
        requiredSourceImageIds: ['img_portrait'],
      },
    );

    expect(result).not.toBeNull();
    if (!result || !('elements' in result)) {
      throw new Error('Expected generated slide content');
    }
    expect(result.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          src: persistedUrl,
          left: 560,
          top: 150,
          width: 150,
          height: 300,
        }),
      ]),
    );
  });

  test('rejects a slide whose content-bearing elements overlap', async () => {
    const aiCall: AICallFn = async () =>
      JSON.stringify({
        elements: [
          {
            id: 'first',
            type: 'text',
            left: 60,
            top: 80,
            width: 500,
            height: 100,
            content: '<p>First block</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
          {
            id: 'second',
            type: 'text',
            left: 100,
            top: 100,
            width: 500,
            height: 100,
            content: '<p>Second block</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });

    const result = await generateSceneContent(
      {
        id: 'scene_overlap',
        type: 'slide',
        title: 'Overlap',
        description: 'Detect overlap',
        keyPoints: ['Keep content readable'],
        order: 1,
      },
      aiCall,
    );

    expect(result).toBeNull();
  });

  test('reports exact layout defects and injects them into the next prompt', async () => {
    let feedback = '';
    const invalidAiCall: AICallFn = async () =>
      JSON.stringify({
        elements: [
          {
            id: 'outside',
            type: 'text',
            left: 940,
            top: 80,
            width: 200,
            height: 100,
            content: '<p>Outside</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });
    const outline: SceneOutline = {
      id: 'scene_retry_feedback',
      type: 'slide',
      title: 'Layout feedback',
      description: 'Keep content in bounds',
      keyPoints: ['Readable geometry'],
      order: 1,
    };

    const first = await generateSceneContent(outline, invalidAiCall, {
      onValidationFailure: (directive) => {
        feedback = directive;
      },
    });
    expect(first).toBeNull();
    expect(feedback).toContain('Correct these layout defects exactly');

    let retryPrompt = '';
    const validAiCall: AICallFn = async (_system, user) => {
      retryPrompt = user;
      return JSON.stringify({
        elements: [
          {
            id: 'inside',
            type: 'text',
            left: 60,
            top: 80,
            width: 500,
            height: 100,
            content: '<p>Inside</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      });
    };

    const second = await generateSceneContent(outline, validAiCall, {
      validationDirective: feedback,
    });
    expect(second).not.toBeNull();
    expect(retryPrompt).toContain('REQUIRED CORRECTION FROM THE PREVIOUS ATTEMPT');
    expect(retryPrompt).toContain(feedback);
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

  test('renders only trusted resource access without calling the model', async () => {
    const downloadUrl = 'https://qalem.ma/A7bK2';
    const qrImageUrl = '/api/classroom-media/classroom-1/resources/resource_1-qr.png';
    const aiCall = vi.fn<AICallFn>().mockResolvedValue(
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
      }),
    );

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

    expect(result).not.toBeNull();
    expect(aiCall).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain(downloadUrl);
    expect(JSON.stringify(result)).toContain(qrImageUrl);
    expect(JSON.stringify(result)).not.toContain('cours.tpe-treso.ma');
  });

  test('accepts the persisted short link when its visible label omits the scheme', () => {
    expect(
      hasUnexpectedLearnerUrl(
        [{ type: 'text', content: '<p>Téléchargez sur qalem.ma/A7bK2</p>' }],
        ['https://qalem.ma/A7bK2'],
      ),
    ).toBe(false);
  });

  test('rejects an illustrative short code even on the Qalem domain', () => {
    expect(
      hasUnexpectedLearnerUrl(
        [{ type: 'text', content: '<p>Téléchargez sur qalem.ma/Ab3X9</p>' }],
        ['https://qalem.ma/A7bK2'],
      ),
    ).toBe(true);
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
    expect(result.data?.syllabus.learningObjectives).toEqual(['To be confirmed by the author']);
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
