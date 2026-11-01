import { describe, expect, it } from 'vitest';
import {
  buildCaptureStepScenes,
  stepNarration,
  type CaptureStepInput,
} from '@/lib/capture/step-scenes';

function step(overrides: Partial<CaptureStepInput> = {}): CaptureStepInput {
  return {
    id: 'aaaa',
    position: 0,
    action: 'click',
    url: 'https://app.example.com/budget',
    element: { label: 'Onglet Prévisions', rect: { x: 100, y: 50, w: 200, h: 40 } },
    pointer: null,
    viewport: { w: 1600, h: 900 },
    description: '',
    imageUrl: '/api/classroom-media/stage1/media/capture-step-aaaa.png',
    ...overrides,
  };
}

describe('stepNarration', () => {
  it('prefers the description written by the author', () => {
    expect(
      stepNarration(step({ description: '  Ouvrez  l’onglet   des prévisions. ' }), 'fr-FR'),
    ).toBe('Ouvrez l’onglet des prévisions.');
  });

  it('builds a sentence from the action when the description is empty', () => {
    expect(stepNarration(step(), 'fr-FR')).toBe('Cliquez sur « Onglet Prévisions ».');
    expect(stepNarration(step(), 'en-US')).toBe('Click “Onglet Prévisions”.');
    expect(stepNarration(step({ action: 'navigate' }), 'fr-FR')).toBe(
      'Ouvrez la page app.example.com/budget.',
    );
    expect(stepNarration(step({ element: null }), 'fr-FR')).toBe("Cliquez à l'endroit encadré.");
  });
});

describe('buildCaptureStepScenes', () => {
  it('shows the real screenshot with the target framed and says what is shown', () => {
    const [scene] = buildCaptureStepScenes({
      stageId: 'stage1',
      steps: [step()],
      firstOrder: 3,
      locale: 'fr-FR',
      agentId: 'persona-professor',
    });
    const content = scene.content;
    if (content.type !== 'slide') throw new Error('slide attendue');
    const elements = content.canvas.elements as Array<{ id: string; type: string; src?: string }>;

    expect(scene.id).toBe('capture_aaaa');
    expect(scene.order).toBe(3);
    expect(elements.find((element) => element.type === 'image')?.src).toBe(
      '/api/classroom-media/stage1/media/capture-step-aaaa.png',
    );
    expect(elements.some((element) => element.type === 'shape')).toBe(true);

    const speech = scene.actions?.find((action) => action.type === 'speech');
    expect(speech).toMatchObject({
      text: 'Cliquez sur « Onglet Prévisions ».',
      agentId: 'persona-professor',
    });
    const spotlight = scene.actions?.find((action) => action.type === 'spotlight');
    expect(spotlight).toMatchObject({ elementId: 'marker_aaaa' });
  });

  it('keeps the frame inside the screenshot and orders by position', () => {
    const scenes = buildCaptureStepScenes({
      stageId: 'stage1',
      steps: [
        step({ id: 'b', position: 1, element: { rect: { x: 1590, y: 890, w: 40, h: 40 } } }),
        step({ id: 'a', position: 0 }),
      ],
      firstOrder: 0,
      locale: 'fr-FR',
    });
    expect(scenes.map((scene) => scene.id)).toEqual(['capture_a', 'capture_b']);
    const content = scenes[1].content;
    if (content.type !== 'slide') throw new Error('slide attendue');
    const elements = content.canvas.elements as Array<{
      type: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }>;
    const image = elements.find((element) => element.type === 'image');
    const marker = elements.find((element) => element.type === 'shape');
    if (!image || !marker) throw new Error('image et cadre attendus');
    expect(marker.left + marker.width).toBeLessThanOrEqual(image.left + image.width + 0.001);
    expect(marker.top + marker.height).toBeLessThanOrEqual(image.top + image.height + 0.001);
  });

  it('falls back to the whole screenshot when nothing locates the target', () => {
    const [scene] = buildCaptureStepScenes({
      stageId: 'stage1',
      steps: [step({ element: null, pointer: null, action: 'scroll' })],
      firstOrder: 0,
      locale: 'fr-FR',
    });
    expect(scene.actions?.find((action) => action.type === 'spotlight')).toMatchObject({
      elementId: 'image_aaaa',
    });
  });
});
