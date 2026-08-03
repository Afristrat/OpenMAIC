import { current, produce } from 'immer';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, Slide } from '@openmaic/dsl';
import { getElementListRange } from '@/lib/utils/element';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';

type ElementPatch = Partial<PPTElement>;
type ElementPropName = string;

// Cap undo history so long editing sessions don't grow memory unbounded.
export const MAX_HISTORY = 50;

export type SlideElementAlignCommand =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'vertical'
  | 'horizontal'
  | 'center';

// slide.update is for slide metadata only (theme, background, viewport, etc).
// Element and animation collections must be mutated through their dedicated
// ops so undo/redo, serialization, and (future) PPTX round-trip stay coherent.
export type SlideMetaPatch = Partial<Omit<Slide, 'elements' | 'animations'>>;

export type SlideEditOperation =
  | {
      type: 'slide.update';
      patch: SlideMetaPatch;
    }
  | {
      type: 'element.add';
      element: PPTElement;
      index?: number;
    }
  | {
      type: 'element.update';
      elementId: string;
      patch: ElementPatch;
    }
  | {
      type: 'element.updateMany';
      elementIds: string[];
      patch: ElementPatch;
    }
  | {
      type: 'element.delete';
      elementId: string;
    }
  | {
      type: 'element.deleteMany';
      elementIds: string[];
    }
  | {
      type: 'element.reorder';
      elementId: string;
      index: number;
    }
  | {
      type: 'element.duplicate';
      elementIds: string[];
      idMap: Record<string, string>;
      offset?: {
        x: number;
        y: number;
      };
    }
  | {
      type: 'element.align';
      elementIds: string[];
      command: SlideElementAlignCommand;
    }
  | {
      /** Move a selection into the visible slide bounds without changing its content. */
      type: 'element.fitCanvas';
      elementIds: string[];
    }
  | {
      /** Move a selection by a keyboard-sized delta while keeping it visible. */
      type: 'element.nudge';
      elementIds: string[];
      deltaX: number;
      deltaY: number;
    }
  | {
      /** Separate generated elements whose bounding boxes conceal one another. */
      type: 'element.resolveOverlaps';
      elementIds: string[];
    }
  | {
      type: 'element.removeProps';
      elementId: string;
      propNames: ElementPropName[];
    }
  | {
      type: 'text.updateContent';
      elementId: string;
      content: string;
    };

export interface SlideEditHistory {
  past: SlideContent[];
  present: SlideContent;
  future: SlideContent[];
}

export function createSlideEditHistory(initial: SlideContent): SlideEditHistory {
  return {
    past: [],
    // Defensive clone: initial comes from outside immer, so the caller could
    // still mutate it after construction. Internal history snapshots are
    // immer-produced and already frozen, so we never re-clone them.
    present: cloneSlideContent(initial),
    future: [],
  };
}

export function applySlideEditOperation(
  content: SlideContent,
  operation: SlideEditOperation,
): SlideContent;
export function applySlideEditOperation(
  history: SlideEditHistory,
  operation: SlideEditOperation,
): SlideEditHistory;
export function applySlideEditOperation(
  target: SlideContent | SlideEditHistory,
  operation: SlideEditOperation,
): SlideContent | SlideEditHistory {
  if (isSlideEditHistory(target)) {
    const next = applyOperationToContent(target.present, operation);
    // immer's produce returns the same reference when the recipe didn't
    // mutate the draft (e.g. element.update against a missing id). Skip the
    // history push so undo doesn't replay empty steps.
    if (next === target.present) return target;
    return {
      past: capHistory([...target.past, target.present]),
      present: next,
      future: [],
    };
  }

  return applyOperationToContent(target, operation);
}

export function undoSlideEditOperation(history: SlideEditHistory): SlideEditHistory {
  if (history.past.length === 0) return history;

  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoSlideEditOperation(history: SlideEditHistory): SlideEditHistory {
  if (history.future.length === 0) return history;

  const next = history.future[0];
  return {
    past: capHistory([...history.past, history.present]),
    present: next,
    future: history.future.slice(1),
  };
}

function applyOperationToContent(
  content: SlideContent,
  operation: SlideEditOperation,
): SlideContent {
  return produce(content, (draft) => {
    switch (operation.type) {
      case 'slide.update': {
        // Type-level narrowing via SlideMetaPatch already forbids elements /
        // animations, but a runtime guard closes the `as any` escape hatch
        // at call sites. Those collections must go through their dedicated
        // ops so undo/redo / serialization stays single-source.
        if ('elements' in operation.patch || 'animations' in operation.patch) {
          throw new Error(
            'slide.update: use dedicated element / animation ops to mutate those collections',
          );
        }
        Object.assign(draft.canvas, operation.patch);
        return;
      }
      case 'element.add': {
        if (draft.canvas.elements.some((el) => el.id === operation.element.id)) {
          throw new Error(`element.add: id "${operation.element.id}" already exists`);
        }
        const index =
          typeof operation.index === 'number'
            ? Math.max(0, Math.min(operation.index, draft.canvas.elements.length))
            : draft.canvas.elements.length;
        draft.canvas.elements.splice(index, 0, cloneElement(operation.element));
        return;
      }
      case 'element.update': {
        const element = draft.canvas.elements.find((item) => item.id === operation.elementId);
        if (!element) return;
        Object.assign(element, operation.patch);
        return;
      }
      case 'element.updateMany': {
        const elementIds = new Set(operation.elementIds);
        draft.canvas.elements.forEach((element) => {
          if (elementIds.has(element.id)) Object.assign(element, operation.patch);
        });
        return;
      }
      case 'element.delete': {
        // Pre-check so deleting a missing id is a real no-op (same content ref)
        // — without this, the unconditional .filter assignment would always
        // count as a mutation and bloat undo history with empty steps.
        if (!draft.canvas.elements.some((el) => el.id === operation.elementId)) return;
        draft.canvas.elements = draft.canvas.elements.filter(
          (element) => element.id !== operation.elementId,
        );
        if (draft.canvas.animations) {
          draft.canvas.animations = draft.canvas.animations.filter(
            (animation) => animation.elId !== operation.elementId,
          );
        }
        return;
      }
      case 'element.deleteMany': {
        const elementIds = new Set(operation.elementIds);
        if (!draft.canvas.elements.some((el) => elementIds.has(el.id))) return;
        draft.canvas.elements = draft.canvas.elements.filter(
          (element) => !elementIds.has(element.id),
        );
        if (draft.canvas.animations) {
          draft.canvas.animations = draft.canvas.animations.filter(
            (animation) => !elementIds.has(animation.elId),
          );
        }
        return;
      }
      case 'element.reorder': {
        const currentIndex = draft.canvas.elements.findIndex(
          (element) => element.id === operation.elementId,
        );
        if (currentIndex === -1) return;

        const [element] = draft.canvas.elements.splice(currentIndex, 1);
        const nextIndex = Math.max(0, Math.min(operation.index, draft.canvas.elements.length));
        draft.canvas.elements.splice(nextIndex, 0, element);
        return;
      }
      case 'element.duplicate': {
        const missing = operation.elementIds.filter((id) => !operation.idMap[id]);
        if (missing.length > 0) {
          throw new Error(`element.duplicate: idMap missing entries for [${missing.join(', ')}]`);
        }
        const existing = new Set(draft.canvas.elements.map((el) => el.id));
        const collisions = operation.elementIds
          .map((id) => operation.idMap[id])
          .filter((newId) => existing.has(newId));
        if (collisions.length > 0) {
          throw new Error(
            `element.duplicate: new ids collide with existing elements: [${collisions.join(', ')}]`,
          );
        }

        const offset = operation.offset ?? { x: 20, y: 20 };
        const elementIds = new Set(operation.elementIds);
        const duplicatedElements = draft.canvas.elements
          .filter((element) => elementIds.has(element.id))
          .map((element) => {
            // Deep clone via current() + structuredClone so the duplicate
            // doesn't share nested references (start/end tuples, outline,
            // points, etc) with the source. immer's COW would handle most
            // mutations safely, but future ops that operate on nested
            // arrays in-place (sort/reverse/splice) would silently leak —
            // keep the kernel's invariants independent of which mutation
            // shape future op consumers pick.
            const source = structuredClone(current(element)) as PPTElement;
            return {
              ...source,
              id: operation.idMap[source.id],
              left: source.left + offset.x,
              top: source.top + offset.y,
            };
          });

        draft.canvas.elements.push(...duplicatedElements);
        return;
      }
      case 'element.align': {
        alignElementsToCanvas(draft.canvas, operation.elementIds, operation.command);
        return;
      }
      case 'element.fitCanvas': {
        fitElementsToCanvas(draft.canvas, operation.elementIds);
        return;
      }
      case 'element.nudge': {
        nudgeElements(draft.canvas, operation.elementIds, operation.deltaX, operation.deltaY);
        return;
      }
      case 'element.resolveOverlaps': {
        resolveElementOverlaps(draft.canvas, operation.elementIds);
        return;
      }
      case 'element.removeProps': {
        const element = draft.canvas.elements.find((item) => item.id === operation.elementId);
        if (!element) return;
        operation.propNames.forEach((propName) => {
          delete (element as Record<string, unknown>)[propName];
        });
        return;
      }
      case 'text.updateContent': {
        const element = draft.canvas.elements.find((item) => item.id === operation.elementId);
        if (!element || element.type !== 'text') return;
        element.content = operation.content;
        return;
      }
    }
  });
}

/**
 * Translates a selection just enough to make its bounding box visible. A
 * selection wider/taller than the slide is pinned to the corresponding origin:
 * resizing text blindly would create a different readability problem. This is
 * deliberately a geometry repair, not an AI content rewrite.
 */
function fitElementsToCanvas(slide: Slide, elementIds: string[]) {
  const selectedIds = new Set(elementIds);
  const selected = slide.elements.filter((element) => selectedIds.has(element.id));
  if (selected.length === 0) return;

  const range = getElementListRange(selected);
  const width = slide.viewportSize;
  const height = slide.viewportSize * slide.viewportRatio;
  const offsetX = range.minX < 0 ? -range.minX : range.maxX > width ? width - range.maxX : 0;
  const offsetY = range.minY < 0 ? -range.minY : range.maxY > height ? height - range.maxY : 0;
  if (offsetX === 0 && offsetY === 0) return;

  slide.elements.forEach((element) => {
    if (!selectedIds.has(element.id)) return;
    element.left += offsetX;
    element.top += offsetY;
  });
}

function nudgeElements(slide: Slide, elementIds: string[], requestedX: number, requestedY: number) {
  const selectedIds = new Set(elementIds);
  const selected = slide.elements.filter((element) => selectedIds.has(element.id));
  if (selected.length === 0) return;

  const range = getElementListRange(selected);
  const width = slide.viewportSize;
  const height = width * slide.viewportRatio;
  const deltaX = clampTranslation(requestedX, -range.minX, width - range.maxX);
  const deltaY = clampTranslation(requestedY, -range.minY, height - range.maxY);
  if (deltaX === 0 && deltaY === 0) return;

  slide.elements.forEach((element) => {
    if (!selectedIds.has(element.id)) return;
    element.left += deltaX;
    element.top += deltaY;
  });
}

function resolveElementOverlaps(slide: Slide, elementIds: string[]) {
  const targetIds = new Set(elementIds);
  if (targetIds.size < 2) return;
  fitElementsToCanvas(slide, elementIds);

  const maxIterations = Math.max(8, slide.elements.length * slide.elements.length * 2);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const issue = auditSlideLayout(slide).find(
      (candidate) =>
        candidate.type === 'overlap' &&
        candidate.elementIds.every((elementId) => targetIds.has(elementId)),
    );
    if (!issue || issue.type !== 'overlap') return;

    const anchor = slide.elements.find((element) => element.id === issue.elementIds[0]);
    const moving = slide.elements.find((element) => element.id === issue.elementIds[1]);
    if (!anchor || !moving) return;

    const anchorRange = getElementListRange([anchor]);
    const movingRange = getElementListRange([moving]);
    const width = slide.viewportSize;
    const height = width * slide.viewportRatio;
    const gap = 8;
    const requested = [
      { x: anchorRange.maxX + gap - movingRange.minX, y: 0 },
      { x: anchorRange.minX - gap - movingRange.maxX, y: 0 },
      { x: 0, y: anchorRange.maxY + gap - movingRange.minY },
      { x: 0, y: anchorRange.minY - gap - movingRange.maxY },
    ];

    const candidates = requested
      .map(({ x, y }) => ({
        x: clampTranslation(x, -movingRange.minX, width - movingRange.maxX),
        y: clampTranslation(y, -movingRange.minY, height - movingRange.maxY),
      }))
      .filter(({ x, y }) => x !== 0 || y !== 0)
      .filter(({ x, y }) => !rangesOverlap(anchorRange, translateRange(movingRange, x, y)))
      .map(({ x, y }) => ({
        x,
        y,
        collisions: slide.elements.filter((element) => {
          if (element.id === moving.id) return false;
          return rangesOverlap(getElementListRange([element]), translateRange(movingRange, x, y));
        }).length,
        distance: Math.abs(x) + Math.abs(y),
      }))
      .sort((a, b) => a.collisions - b.collisions || a.distance - b.distance);

    const best = candidates[0];
    if (!best) return;
    moving.left += best.x;
    moving.top += best.y;
  }
}

interface ElementRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clampTranslation(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}

function translateRange(range: ElementRange, x: number, y: number): ElementRange {
  return {
    minX: range.minX + x,
    minY: range.minY + y,
    maxX: range.maxX + x,
    maxY: range.maxY + y,
  };
}

function rangesOverlap(a: ElementRange, b: ElementRange): boolean {
  const overlapWidth = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapHeight = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (overlapWidth <= 0 || overlapHeight <= 0) return false;
  const overlapArea = overlapWidth * overlapHeight;
  const smallerArea = Math.min(
    (a.maxX - a.minX) * (a.maxY - a.minY),
    (b.maxX - b.minX) * (b.maxY - b.minY),
  );
  return smallerArea > 0 && overlapArea / smallerArea >= 0.2;
}

function isSlideEditHistory(target: SlideContent | SlideEditHistory): target is SlideEditHistory {
  return 'present' in target && 'past' in target && 'future' in target;
}

function cloneSlideContent(content: SlideContent): SlideContent {
  return structuredClone(content);
}

function cloneElement(element: PPTElement): PPTElement {
  return structuredClone(element);
}

function capHistory(past: SlideContent[]): SlideContent[] {
  return past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
}

function alignElementsToCanvas(
  slide: Slide,
  elementIds: string[],
  command: SlideElementAlignCommand,
) {
  const selectedIds = new Set(elementIds);
  const selectedElements = slide.elements.filter((element) => selectedIds.has(element.id));
  if (selectedElements.length === 0) return;

  // Reuse the canonical geometry helper so line/rotated elements compute the
  // right bounding box. The local fork that lived here treated lines as
  // height 0 and ignored rotation.
  const range = getElementListRange(selectedElements);
  const viewportWidth = slide.viewportSize;
  const viewportHeight = slide.viewportSize * slide.viewportRatio;

  let offsetX = 0;
  let offsetY = 0;

  switch (command) {
    case 'center':
      offsetX = range.minX + (range.maxX - range.minX) / 2 - viewportWidth / 2;
      offsetY = range.minY + (range.maxY - range.minY) / 2 - viewportHeight / 2;
      break;
    case 'top':
      offsetY = range.minY;
      break;
    case 'vertical':
      offsetY = range.minY + (range.maxY - range.minY) / 2 - viewportHeight / 2;
      break;
    case 'bottom':
      offsetY = range.maxY - viewportHeight;
      break;
    case 'left':
      offsetX = range.minX;
      break;
    case 'horizontal':
      offsetX = range.minX + (range.maxX - range.minX) / 2 - viewportWidth / 2;
      break;
    case 'right':
      offsetX = range.maxX - viewportWidth;
      break;
  }

  slide.elements.forEach((element) => {
    if (!selectedIds.has(element.id)) return;
    element.left -= offsetX;
    element.top -= offsetY;
  });
}
