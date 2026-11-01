/**
 * Étapes de capture validées vers diapositives : une diapositive par étape, avec la vraie capture
 * d'écran, le point visé encadré et une voix off tirée de la description de l'étape. Ce qui est dit
 * est donc exactement ce qui est montré. Aucun modèle n'intervient : la sortie est déterministe.
 */

import type { PPTElement } from '@openmaic/dsl';
import type { Scene } from '@/lib/types/stage';

export const CAPTURE_SCENE_PREFIX = 'capture_';

const SLIDE_WIDTH = 1000;
const SLIDE_HEIGHT = 562.5;
const IMAGE_BOX = { left: 50, top: 112, width: 900, height: 420 } as const;
const MARKER_PADDING = 6;
const MARKER_MIN_SIZE = 36;

export type CaptureStepLocale = 'fr-FR' | 'ar-MA' | 'en-US';

export type CaptureStepInput = {
  id: string;
  position: number;
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'select' | 'key';
  url: string;
  element: { label?: string; rect?: { x: number; y: number; w: number; h: number } } | null;
  pointer: { x: number; y: number } | null;
  viewport: { w: number; h: number };
  description: string;
  /** Adresse de l'image dans le média du cours (/api/classroom-media/...). */
  imageUrl: string;
};

type Phrases = {
  step: (number: number) => string;
  click: (label: string | null) => string;
  type: (label: string | null) => string;
  select: (label: string | null) => string;
  navigate: (address: string) => string;
  scroll: string;
  key: string;
};

const PHRASES: Record<CaptureStepLocale, Phrases> = {
  'fr-FR': {
    step: (n) => `Étape ${n}`,
    click: (label) => (label ? `Cliquez sur « ${label} ».` : "Cliquez à l'endroit encadré."),
    type: (label) =>
      label ? `Renseignez le champ « ${label} ».` : "Renseignez le champ à l'endroit encadré.",
    select: (label) =>
      label ? `Choisissez l'option « ${label} ».` : "Choisissez l'option encadrée.",
    navigate: (address) => `Ouvrez la page ${address}.`,
    scroll: 'Faites défiler la page jusqu’à la zone suivante.',
    key: 'Appuyez sur la touche indiquée.',
  },
  'en-US': {
    step: (n) => `Step ${n}`,
    click: (label) => (label ? `Click “${label}”.` : 'Click the highlighted spot.'),
    type: (label) => (label ? `Fill in the “${label}” field.` : 'Fill in the highlighted field.'),
    select: (label) => (label ? `Choose the “${label}” option.` : 'Choose the highlighted option.'),
    navigate: (address) => `Open the page ${address}.`,
    scroll: 'Scroll down to the next area.',
    key: 'Press the indicated key.',
  },
  'ar-MA': {
    step: (n) => `الخطوة ${n}`,
    click: (label) => (label ? `انقر على «${label}».` : 'انقر على الموضع المؤطَّر.'),
    type: (label) => (label ? `املأ الحقل «${label}».` : 'املأ الحقل المؤطَّر.'),
    select: (label) => (label ? `اختر الخيار «${label}».` : 'اختر الخيار المؤطَّر.'),
    navigate: (address) => `افتح الصفحة ${address}.`,
    scroll: 'مرِّر الصفحة إلى المنطقة التالية.',
    key: 'اضغط على المفتاح المبيَّن.',
  },
};

function pageAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

/** Phrase dite pour l'étape : la description de l'auteur d'abord, sinon une phrase tirée de l'action. */
export function stepNarration(step: CaptureStepInput, locale: CaptureStepLocale): string {
  const described = step.description.replace(/\s+/g, ' ').trim();
  if (described) return described;
  const phrases = PHRASES[locale];
  const label = step.element?.label?.trim() || null;
  switch (step.action) {
    case 'click':
      return phrases.click(label);
    case 'type':
      return phrases.type(label);
    case 'select':
      return phrases.select(label);
    case 'navigate':
      return phrases.navigate(pageAddress(step.url));
    case 'scroll':
      return phrases.scroll;
    case 'key':
      return phrases.key;
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function fitImage(viewport: { w: number; h: number }): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const ratio = viewport.w / viewport.h;
  let width = IMAGE_BOX.width;
  let height = width / ratio;
  if (height > IMAGE_BOX.height) {
    height = IMAGE_BOX.height;
    width = height * ratio;
  }
  return {
    left: IMAGE_BOX.left + (IMAGE_BOX.width - width) / 2,
    top: IMAGE_BOX.top + (IMAGE_BOX.height - height) / 2,
    width,
    height,
  };
}

function markerBox(
  step: CaptureStepInput,
  image: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } | null {
  const scale = image.width / step.viewport.w;
  const rect = step.element?.rect;
  const box = rect
    ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
    : step.pointer
      ? { x: step.pointer.x, y: step.pointer.y, w: 0, h: 0 }
      : null;
  if (!box) return null;
  const width = Math.max(box.w * scale + MARKER_PADDING * 2, MARKER_MIN_SIZE);
  const height = Math.max(box.h * scale + MARKER_PADDING * 2, MARKER_MIN_SIZE);
  const centreX = image.left + (box.x + box.w / 2) * scale;
  const centreY = image.top + (box.y + box.h / 2) * scale;
  const left = Math.min(
    Math.max(centreX - width / 2, image.left),
    image.left + image.width - width,
  );
  const top = Math.min(
    Math.max(centreY - height / 2, image.top),
    image.top + image.height - height,
  );
  return { left, top, width, height };
}

export function buildCaptureStepScenes(input: {
  stageId: string;
  steps: CaptureStepInput[];
  firstOrder: number;
  locale: CaptureStepLocale;
  /** Agent qui porte la voix du cours ; absent, la voix du professeur historique. */
  agentId?: string;
}): Scene[] {
  const phrases = PHRASES[input.locale];
  const ordered = [...input.steps].sort((a, b) => a.position - b.position);
  return ordered.map((step, index): Scene => {
    const sceneId = `${CAPTURE_SCENE_PREFIX}${step.id}`;
    const narration = stepNarration(step, input.locale);
    const image = fitImage(step.viewport);
    const marker = markerBox(step, image);
    const titleText = phrases.step(index + 1);
    const titleId = `title_${step.id}`;
    const imageId = `image_${step.id}`;
    const markerId = `marker_${step.id}`;
    const captionId = `caption_${step.id}`;

    const elements: PPTElement[] = [
      {
        id: titleId,
        type: 'text',
        left: 50,
        top: 24,
        width: 900,
        height: 64,
        rotate: 0,
        content: `<p style="font-size: 30px; color: #1e3a5f;"><strong>${escapeHtml(titleText)}</strong></p>`,
        defaultColor: '#1e3a5f',
        defaultFontName: 'Microsoft YaHei',
      },
      {
        id: imageId,
        type: 'image',
        src: step.imageUrl,
        left: image.left,
        top: image.top,
        width: image.width,
        height: image.height,
        rotate: 0,
        fixedRatio: true,
      },
    ];
    if (marker) {
      elements.push({
        id: markerId,
        type: 'shape',
        path: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
        viewBox: [1, 1],
        fixedRatio: false,
        fill: 'rgba(209, 68, 36, 0.12)',
        outline: { color: '#d14424', width: 4, style: 'solid' },
        left: marker.left,
        top: marker.top,
        width: marker.width,
        height: marker.height,
        rotate: 0,
      });
    }
    elements.push({
      id: captionId,
      type: 'text',
      left: 50,
      top: SLIDE_HEIGHT - 28,
      width: 900,
      height: 24,
      rotate: 0,
      content: `<p style="font-size: 14px; color: #64748b;">${escapeHtml(narration)}</p>`,
      defaultColor: '#64748b',
      defaultFontName: 'Microsoft YaHei',
    });

    return {
      id: sceneId,
      stageId: input.stageId,
      type: 'slide',
      title: titleText,
      order: input.firstOrder + index,
      content: {
        type: 'slide',
        schemaVersion: 1,
        canvas: {
          id: `canvas_${step.id}`,
          viewportSize: SLIDE_WIDTH,
          viewportRatio: SLIDE_HEIGHT / SLIDE_WIDTH,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
            fontColor: '#333333',
            fontName: 'Microsoft YaHei',
            outline: { color: '#d14424', width: 2, style: 'solid' },
            shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
          },
          background: { type: 'solid', color: '#ffffff' },
          elements,
        },
      },
      actions: [
        { id: `spot_${step.id}`, type: 'spotlight', elementId: marker ? markerId : imageId },
        {
          id: `speech_${step.id}`,
          type: 'speech',
          text: narration,
          ...(input.agentId ? { agentId: input.agentId } : {}),
        },
      ],
    };
  });
}
