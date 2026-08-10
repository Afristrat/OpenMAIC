import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildInsertItems,
  deleteSlideElement,
} from '@/components/edit/surfaces/slide/use-slide-surface';
import { useSlideEditSession } from '@/components/edit/surfaces/slide/slide-edit-session';
import { useCanvasStore } from '@/lib/store/canvas';

function seedEmptySlideSession() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  useSlideEditSession.setState({
    history: {
      past: [],
      present: { type: 'slide', canvas: { id: 's', elements: [] } } as any,
      future: [],
    },
  } as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('slide insert palette', () => {
  beforeEach(seedEmptySlideSession);
  afterEach(() => vi.restoreAllMocks());

  it('exposes text, uploaded image, AI image and background items', () => {
    const items = buildInsertItems((k) => k, undefined);
    expect(items.map((i) => i.id)).toEqual([
      'insert-text',
      'insert-image',
      'insert-ai-image',
      'slide-background',
    ]);
    expect(items[1].popoverContent).toBeTypeOf('function');
    expect(items[0].onInvoke).toBeTypeOf('function');
  });

  it('AI image invoke arms and disarms zone selection', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'setCreatingElement');
    buildInsertItems((k) => k, undefined)[2].onInvoke();
    expect(spy).toHaveBeenLastCalledWith({ type: 'ai-image' });
    buildInsertItems((k) => k, 'ai-image')[2].onInvoke();
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('text-box invoke arms text-insertion (sets creatingElement)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'setCreatingElement');
    buildInsertItems((k) => k, undefined)[0].onInvoke();
    expect(spy).toHaveBeenCalledWith({ type: 'text' });
  });

  it('text-box invoke when already armed disarms (sets creatingElement to null)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'setCreatingElement');
    buildInsertItems((k) => k, 'text')[0].onInvoke();
    expect(spy).toHaveBeenCalledWith(null);
  });

  it('text-box reports active when creating-text is armed', () => {
    expect(buildInsertItems((k) => k, 'text')[0].active).toBe(true);
    expect(buildInsertItems((k) => k, undefined)[0].active).toBe(false);
  });
});

describe('slide element deletion', () => {
  beforeEach(seedEmptySlideSession);
  afterEach(() => vi.restoreAllMocks());

  it('deleteSlideElement dispatches an element.delete op', () => {
    const spy = vi.spyOn(useSlideEditSession.getState(), 'applyOp');
    deleteSlideElement('img-9');
    expect(spy).toHaveBeenCalledWith({ type: 'element.delete', elementId: 'img-9' });
  });
});
