import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildPptxBlob } from '@/lib/export/use-export-pptx';
import { createDefaultSlide, createDefaultTextElement } from '@/lib/edit/slide-edit-elements';
import type { SpeechAction } from '@/lib/types/action';
import type { Scene, SlideContent } from '@/lib/types/stage';

const outputPath = process.env.S1_010_OUTPUT;
assert(outputPath, 'S1_010_OUTPUT is required');

const viewportSize = 1000;
const viewportRatio = 0.5625;
const ratioPx2Inch = 96 * (viewportSize / 960);
const ratioPx2Pt = (96 / 72) * (viewportSize / 960);

function makeScene(
  id: string,
  title: string,
  body: string,
  language: 'fr' | 'ar',
  order: number,
): { scene: Scene; content: SlideContent } {
  const slide = createDefaultSlide(`slide-${id}`);
  const titleElement = createDefaultTextElement(`title-${id}`);
  titleElement.left = 80;
  titleElement.top = 70;
  titleElement.width = 840;
  titleElement.height = 100;
  titleElement.content = `<p style="font-size: 52px; font-weight: bold; font-family: Arial; text-align: ${language === 'ar' ? 'right' : 'left'}">${title}</p>`;

  const bodyElement = createDefaultTextElement(`body-${id}`);
  bodyElement.left = 80;
  bodyElement.top = 210;
  bodyElement.width = 840;
  bodyElement.height = 220;
  bodyElement.content = `<p style="font-size: 32px; font-family: Arial; text-align: ${language === 'ar' ? 'right' : 'left'}">${body}</p>`;
  slide.elements.push(titleElement, bodyElement);

  const content: SlideContent = { type: 'slide', canvas: slide };
  const scene: Scene = {
    id: `scene-${id}`,
    stageId: 'stage-s1-010-proof',
    type: 'slide',
    title,
    order,
    content,
    actions: [
      {
        id: `speech-${id}`,
        type: 'speech',
        text: body,
      } as SpeechAction,
    ],
  };
  return { scene, content };
}

async function main(): Promise<void> {
  const fixtures = [
    makeScene(
      'fr',
      'Une formation lisible et réutilisable',
      'Le support conserve les accents français, les notes et la mise en page après export.',
      'fr',
      1,
    ),
    makeScene(
      'ar',
      'تكوين واضح وقابل لإعادة الاستخدام',
      'يحافظ العرض على النص العربي والملاحظات والتنسيق بعد التصدير.',
      'ar',
      2,
    ),
  ];
  const blob = await buildPptxBlob(
    fixtures.map(({ content }) => content.canvas),
    fixtures.map(({ scene }) => scene),
    viewportRatio,
    viewportSize,
    ratioPx2Inch,
    ratioPx2Pt,
    { mode: 'qalem' },
  );
  assert(blob.size > 10_000, `PPTX unexpectedly small: ${blob.size} bytes`);
  const absoluteOutput = resolve(outputPath!);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, Buffer.from(await blob.arrayBuffer()));
  console.log(JSON.stringify({ output: absoluteOutput, bytes: blob.size, slides: fixtures.length }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
