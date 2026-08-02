import type { PPTElement, Slide } from '@openmaic/dsl';
import { getElementListRange } from '@/lib/utils/element';

export type SlideLayoutIssue =
  | { type: 'out-of-bounds'; elementId: string }
  | { type: 'overlap'; elementIds: readonly [string, string] };

/**
 * Deterministic geometry audit. It deliberately does not infer whether a
 * deliberate overlap (for example a caption on an image) is semantically
 * correct; the editor surfaces it for a human decision instead of silently
 * rearranging content.
 */
export function auditSlideLayout(slide: Slide): SlideLayoutIssue[] {
  const width = slide.viewportSize;
  const height = width * slide.viewportRatio;
  const boxes = slide.elements.map((element) => ({ element, range: getElementListRange([element]) }));
  const issues: SlideLayoutIssue[] = [];

  for (const { element, range } of boxes) {
    if (range.minX < 0 || range.minY < 0 || range.maxX > width || range.maxY > height) {
      issues.push({ type: 'out-of-bounds', elementId: element.id });
    }
  }

  for (let index = 0; index < boxes.length; index += 1) {
    for (let other = index + 1; other < boxes.length; other += 1) {
      const a = boxes[index];
      const b = boxes[other];
      const overlapWidth = Math.min(a.range.maxX, b.range.maxX) - Math.max(a.range.minX, b.range.minX);
      const overlapHeight = Math.min(a.range.maxY, b.range.maxY) - Math.max(a.range.minY, b.range.minY);
      if (overlapWidth > 0 && overlapHeight > 0) {
        issues.push({ type: 'overlap', elementIds: [a.element.id, b.element.id] });
      }
    }
  }
  return issues;
}
