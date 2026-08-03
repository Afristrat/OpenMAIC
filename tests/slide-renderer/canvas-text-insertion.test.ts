import { describe, expect, it, vi } from 'vitest';
import {
  canvasPointFromClient,
  createCanvasTextElement,
  insertCanvasText,
} from '@/components/slide-renderer/Editor/Canvas/hooks/useDrop';

const viewport = { left: 100, top: 50, right: 900, bottom: 500 };

describe('canvas text insertion', () => {
  it('converts client coordinates to scaled slide coordinates', () => {
    expect(canvasPointFromClient(300, 150, viewport, 2)).toEqual({ left: 100, top: 50 });
  });

  it('rejects coordinates outside the slide', () => {
    expect(canvasPointFromClient(99, 150, viewport, 1)).toBeNull();
    expect(canvasPointFromClient(300, 501, viewport, 1)).toBeNull();
    expect(canvasPointFromClient(300, 150, viewport, 0)).toBeNull();
  });

  it('dispatches a text element through the supplied add operation', () => {
    const addElement = vi.fn();

    expect(insertCanvasText('Dropped', 300, 150, viewport, 2, addElement)).toBe(true);
    expect(addElement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', left: 100, top: 50, content: '<p>Dropped</p>' }),
    );
  });

  it('does not dispatch when the pointer is outside the slide', () => {
    const addElement = vi.fn();

    expect(insertCanvasText('Dropped', 99, 150, viewport, 1, addElement)).toBe(false);
    expect(addElement).not.toHaveBeenCalled();
  });

  it('creates an escaped text element at the requested position', () => {
    const element = createCanvasTextElement('<script>alert(1)</script>', 25, 40);

    expect(element).toMatchObject({ type: 'text', left: 25, top: 40 });
    expect(element.id).toMatch(/^text-/);
    expect(element.content).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('creates a caret-ready empty text box for a double-click', () => {
    expect(createCanvasTextElement('', 25, 40).content).toBe('<p><br></p>');
  });
});
