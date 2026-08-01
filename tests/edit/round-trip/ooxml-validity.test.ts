import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPptxBlob } from '@/lib/export/use-export-pptx';
import { createDefaultSlide, createDefaultTextElement } from '@/lib/edit/slide-edit-elements';
import type { Scene, SlideContent } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { PPTLatexElement, PPTTableElement, PPTImageElement } from '@openmaic/dsl';
import { RATIO_PX2_INCH, RATIO_PX2_PT, VIEWPORT_RATIO, VIEWPORT_SIZE } from './fixtures';

const DATA_URL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Deliberately loaded with everything that can corrupt XML if a value flows
// into pptxgenjs unescaped: `&`, `<`, `>`, `"`, `'`, plus non-Latin script
// (Arabic, part of Qalem's FR/AR/EN target) to catch encoding regressions.
const HOSTILE_TEXT = `Rendement & croissance <script>alert("x")</script> ${"'"}A/B${"'"} — تجربة`;

/**
 * Every opening tag has a matching closing tag (self-closing tags excluded).
 * Independent of pptxgenjs internals — a generic structural well-formedness
 * check, same technique already used for the SCORM manifest.
 */
function assertTagsBalanced(xml: string, path: string) {
  const opened = [...xml.matchAll(/<([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s[^>]*)?(?<!\/)>/g)].map(
    (m) => m[1],
  );
  const closed = [...xml.matchAll(/<\/([a-zA-Z][a-zA-Z0-9:_-]*)>/g)].map((m) => m[1]);
  expect(opened.sort(), `${path}: unbalanced tags`).toEqual(closed.sort());
}

/** No bare `&` outside a recognized XML entity — the classic OOXML corruption. */
function assertNoBareAmpersand(xml: string, path: string) {
  const bare = xml.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g);
  expect(bare, `${path}: unescaped "&"`).toBeNull();
}

function buildHostileFixture(): { scene: Scene; content: SlideContent } {
  const slide = createDefaultSlide('slide-1');

  const text = createDefaultTextElement('text-1');
  text.content = `<p>${HOSTILE_TEXT}</p>`;
  slide.elements.push(text);

  const latex: PPTLatexElement = {
    id: 'latex-1',
    type: 'latex',
    left: 40,
    top: 300,
    width: 300,
    height: 80,
    rotate: 0,
    latex: 'x^2 + y^2 = z^2',
  };
  slide.elements.push(latex);

  const table: PPTTableElement = {
    id: 'table-1',
    type: 'table',
    left: 40,
    top: 420,
    width: 400,
    height: 100,
    rotate: 0,
    outline: { width: 1, color: '#000000', style: 'solid' },
    colWidths: [0.5, 0.5],
    cellMinHeight: 36,
    data: [
      [
        { id: 'c1', colspan: 1, rowspan: 1, text: HOSTILE_TEXT },
        { id: 'c2', colspan: 1, rowspan: 1, text: 'Normal' },
      ],
    ],
  };
  slide.elements.push(table);

  const image: PPTImageElement = {
    id: 'image-1',
    type: 'image',
    left: 500,
    top: 40,
    width: 100,
    height: 100,
    rotate: 0,
    fixedRatio: true,
    src: DATA_URL_PNG,
  };
  slide.elements.push(image);

  const content: SlideContent = { type: 'slide', canvas: slide };
  const scene: Scene = {
    id: 'scene-1',
    stageId: 'stage-1',
    type: 'slide',
    title: 'Fixture hostile',
    order: 1,
    content,
    actions: [
      {
        id: 'action-1',
        type: 'speech',
        text: HOSTILE_TEXT,
      } as SpeechAction,
    ],
  };
  return { scene, content };
}

describe('PPTX export produces valid, well-formed OOXML', () => {
  it('every internal XML/rels part is well-formed and required OOXML parts are present', async () => {
    const { scene, content } = buildHostileFixture();

    const blob = await buildPptxBlob(
      [content.canvas],
      [scene],
      VIEWPORT_RATIO,
      VIEWPORT_SIZE,
      RATIO_PX2_INCH,
      RATIO_PX2_PT,
    );
    expect(blob.size).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const requiredParts = [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slides/slide1.xml',
      'ppt/slides/_rels/slide1.xml.rels',
      'docProps/core.xml',
      'docProps/app.xml',
    ];
    for (const part of requiredParts) {
      expect(zip.file(part), `missing required OOXML part: ${part}`).not.toBeNull();
    }

    const xmlEntries = Object.values(zip.files).filter(
      (f) => !f.dir && (f.name.endsWith('.xml') || f.name.endsWith('.rels')),
    );
    expect(xmlEntries.length).toBeGreaterThan(0);

    for (const entry of xmlEntries) {
      const xml = await entry.async('string');
      assertTagsBalanced(xml, entry.name);
      assertNoBareAmpersand(xml, entry.name);
    }

    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    // The formula went through the OMML path (not the SVG-image fallback).
    expect(slideXml).toContain('<m:oMath');
    // Hostile content survived, but escaped — never raw.
    expect(slideXml).not.toContain('<script>');
    expect(slideXml).toContain('&amp;');
    expect(slideXml).toContain('تجربة');

    const notesEntry = zip.file('ppt/notesSlides/notesSlide1.xml');
    if (notesEntry) {
      const notesXml = await notesEntry.async('string');
      assertTagsBalanced(notesXml, 'ppt/notesSlides/notesSlide1.xml');
      assertNoBareAmpersand(notesXml, 'ppt/notesSlides/notesSlide1.xml');
      expect(notesXml).not.toContain('<script>');
    }
  });

  it('writes the Qalem presentation signature without corrupting OOXML', async () => {
    const { scene, content } = buildHostileFixture();
    const blob = await buildPptxBlob(
      [content.canvas],
      [scene],
      VIEWPORT_RATIO,
      VIEWPORT_SIZE,
      RATIO_PX2_INCH,
      RATIO_PX2_PT,
      { mode: 'qalem' },
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slideXml).toContain('Qalem');
    assertTagsBalanced(slideXml, 'ppt/slides/slide1.xml');
  });
});
