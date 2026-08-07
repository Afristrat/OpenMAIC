import { createElement } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneCompletionGate } from '@/components/playback/scene-completion-gate';
import { scheduleAfterVisualCommit } from '@/lib/playback/visual-transition';

describe('scene completion gate', () => {
  test('keeps both learner choices visible instead of launching a discussion automatically', () => {
    const html = renderToStaticMarkup(
      createElement(SceneCompletionGate, {
        title: 'Que souhaitez-vous faire ?',
        deepenLabel: 'Approfondir dans la discussion',
        continueLabel: 'Continuer',
        onDeepen: vi.fn(),
        onContinue: vi.fn(),
      }),
    );

    expect(html).toContain('data-scene-completion-gate="true"');
    expect(html).toContain('Approfondir dans la discussion');
    expect(html).toContain('Continuer');
  });

  test('starts the next audio only after two visual frames', () => {
    const scheduled: FrameRequestCallback[] = [];
    const start = vi.fn();
    const schedule = (callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return scheduled.length;
    };

    scheduleAfterVisualCommit(start, schedule);
    expect(start).not.toHaveBeenCalled();

    scheduled.shift()?.(0);
    expect(start).not.toHaveBeenCalled();

    scheduled.shift()?.(16);
    expect(start).toHaveBeenCalledOnce();
  });
});
