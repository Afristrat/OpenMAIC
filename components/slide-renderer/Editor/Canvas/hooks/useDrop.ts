import { useEffect, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store';
import { createElementId } from '@/lib/edit/element-id';
import { createDefaultTextElement, plainTextToParagraphHtml } from '@/lib/edit/slide-edit-elements';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import type { PPTTextElement } from '@openmaic/dsl';

interface CanvasRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function canvasPointFromClient(
  clientX: number,
  clientY: number,
  viewportRect: CanvasRect,
  canvasScale: number,
) {
  if (
    canvasScale <= 0 ||
    clientX < viewportRect.left ||
    clientX >= viewportRect.right ||
    clientY < viewportRect.top ||
    clientY >= viewportRect.bottom
  ) {
    return null;
  }

  return {
    left: (clientX - viewportRect.left) / canvasScale,
    top: (clientY - viewportRect.top) / canvasScale,
  };
}

export function createCanvasTextElement(text: string, left: number, top: number) {
  return {
    ...createDefaultTextElement(createElementId('text')),
    left,
    top,
    content: text ? plainTextToParagraphHtml(text) : '<p><br></p>',
  };
}

export function insertCanvasText(
  text: string,
  clientX: number,
  clientY: number,
  viewportRect: CanvasRect,
  canvasScale: number,
  addElement: (element: PPTTextElement) => void,
) {
  const point = canvasPointFromClient(clientX, clientY, viewportRect, canvasScale);
  if (!point) return false;

  addElement(createCanvasTextElement(text, point.left, point.top));
  return true;
}

export function useDrop(
  elementRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  canvasScale: number,
) {
  const disableHotkeys = useCanvasStore.use.disableHotkeys();
  const { addElement } = useCanvasOperations();

  useEffect(() => {
    const element = elementRef.current;
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer || disableHotkeys || !viewportRef.current) return;

      const text = e.dataTransfer.getData('text/plain');
      if (!text.trim()) return;

      insertCanvasText(
        text,
        e.clientX,
        e.clientY,
        viewportRef.current.getBoundingClientRect(),
        canvasScale,
        addElement,
      );
    };

    const preventDefault = (e: DragEvent) => e.preventDefault();

    if (element) {
      element.addEventListener('drop', handleDrop);
      element.addEventListener('dragover', preventDefault);
    }

    return () => {
      if (element) {
        element.removeEventListener('drop', handleDrop);
        element.removeEventListener('dragover', preventDefault);
      }
    };
  }, [elementRef, viewportRef, canvasScale, disableHotkeys, addElement]);
}
