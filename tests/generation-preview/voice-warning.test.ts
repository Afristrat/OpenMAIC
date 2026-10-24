import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@/lib/i18n';

const state = vi.hoisted(() => ({ locale: 'fr-FR' as string, scenes: [] as unknown[] }));

vi.mock('@/lib/hooks/use-i18n', async () => {
  const { translate } = await import('@/lib/i18n');
  return {
    useI18n: () => ({
      locale: state.locale,
      t: (key: string, values?: Record<string, unknown>) =>
        translate(state.locale as Locale, key, values),
    }),
  };
});
// zustand renders its initial state on the server: the open course is injected instead.
vi.mock('@/lib/store/stage', () => ({
  useStageStore: Object.assign(
    (select: (value: { scenes: unknown[] }) => unknown) => select({ scenes: state.scenes }),
    { getState: () => ({ stage: null, scenes: state.scenes }) },
  ),
}));
vi.mock('@/lib/audio/complete-missing-voices', () => ({ completeMissingVoices: vi.fn() }));
vi.mock('@/lib/export/persist-before-server-export', () => ({
  persistCurrentClassroomForExport: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import { readVoiceWarning, shouldAutoOpenCourse } from '@/lib/generation/voice-warning';
import { VoiceWarningNotice } from '@/components/generation/voice-warning-notice';
import { MissingVoicesBanner } from '@/components/stage/missing-voices-banner';

const speech = (id: string, audioUrl?: string) => ({
  id,
  type: 'speech',
  text: `Texte ${id}`,
  ...(audioUrl ? { audioUrl } : {}),
});

function setScenes(actions: unknown[]): void {
  state.scenes = [{ id: 's1', order: 1, actions }];
}

describe('readVoiceWarning', () => {
  it('returns the counts of a valid warning', () => {
    expect(readVoiceWarning({ ttsMissing: 27, ttsRequested: 150 })).toEqual({
      missing: 27,
      total: 150,
    });
  });

  it.each([
    undefined,
    null,
    {},
    { ttsMissing: 0, ttsRequested: 10 },
    { ttsMissing: -1, ttsRequested: 10 },
    { ttsMissing: '3', ttsRequested: 10 },
    { ttsMissing: 3, ttsRequested: 'x' },
    { ttsMissing: Number.NaN, ttsRequested: 10 },
  ])('returns null for %j', (value) => {
    expect(readVoiceWarning(value)).toBeNull();
  });

  it('never reports more silent lines than lines', () => {
    expect(readVoiceWarning({ ttsMissing: 12, ttsRequested: 10 })).toEqual({
      missing: 10,
      total: 10,
    });
  });
});

describe('shouldAutoOpenCourse', () => {
  it('opens a succeeded course at once', () => {
    expect(shouldAutoOpenCourse({ status: 'succeeded', result: { url: '/c/1' } })).toBe(true);
  });

  it('stays on the status page when the course has a voice warning', () => {
    expect(
      shouldAutoOpenCourse({
        status: 'succeeded',
        result: { url: '/c/1' },
        warnings: { ttsMissing: 2, ttsRequested: 9 },
      }),
    ).toBe(false);
  });

  it('does not open a running or failed job', () => {
    expect(shouldAutoOpenCourse({ status: 'running', result: { url: '/c/1' } })).toBe(false);
    expect(shouldAutoOpenCourse({ status: 'failed' })).toBe(false);
  });
});

describe('VoiceWarningNotice', () => {
  beforeEach(() => {
    state.locale = 'fr-FR';
  });

  it('says how many tracks failed out of how many, as a status, with the hint', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceWarningNotice, { missing: 27, total: 150, showHint: true }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Pistes vocales non générées : 27 sur 150.');
    expect(html).toContain('« Générer les voix manquantes »');
  });

  it('omits the hint when the reader cannot act', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceWarningNotice, { missing: 1, total: 2, showHint: false }),
    );
    expect(html).toContain('Pistes vocales non générées : 1 sur 2.');
    expect(html).not.toContain('Générer les voix manquantes');
  });

  it.each([
    ['en-US', 'Voice tracks not generated: 4 of 10.'],
    ['ar-MA', 'تعذّر توليد المقاطع الصوتية: 4 من أصل 10.'],
  ])('renders in %s with logical (RTL-safe) spacing only', (locale, expected) => {
    state.locale = locale;
    const html = renderToStaticMarkup(
      createElement(VoiceWarningNotice, { missing: 4, total: 10, showHint: true }),
    );
    expect(html).toContain(expected);
    expect(html).toContain('10');
    expect(html).not.toMatch(/\b(?:ml|mr|pl|pr|text-left|text-right)-/);
    expect(html).not.toContain('{{');
  });
});

describe('MissingVoicesBanner', () => {
  beforeEach(() => {
    state.locale = 'fr-FR';
  });

  it('shows the real counts of the open course and the button for an editor', () => {
    setScenes([speech('a'), speech('b', '/b.mp3'), speech('c'), speech('d', '/d.mp3')]);
    const html = renderToStaticMarkup(createElement(MissingVoicesBanner, { canComplete: true }));
    expect(html).toContain('Pistes vocales non générées : 2 sur 4.');
    expect(html).toContain('data-testid="generate-missing-voices"');
  });

  it('hides the button, and the hint to use it, without the right to edit', () => {
    setScenes([speech('a'), speech('b', '/b.mp3')]);
    const html = renderToStaticMarkup(createElement(MissingVoicesBanner, { canComplete: false }));
    expect(html).toContain('Pistes vocales non générées : 1 sur 2.');
    expect(html).not.toContain('generate-missing-voices');
    expect(html).not.toContain('Générer les voix manquantes');
  });

  it('renders nothing when every line is voiced', () => {
    setScenes([speech('a', '/a.mp3'), speech('b', '/b.mp3')]);
    expect(renderToStaticMarkup(createElement(MissingVoicesBanner, { canComplete: true }))).toBe(
      '',
    );
  });
});
