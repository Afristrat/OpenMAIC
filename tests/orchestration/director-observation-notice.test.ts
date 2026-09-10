import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DirectorObservationNotice } from '@/components/chat/director-observation-notice';
import type { DirectorObservation } from '@/lib/orchestration/observed-director';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`,
  }),
}));
const observed: DirectorObservation = {
  cohort: 'data-driven',
  reason: 'observed-pattern',
  suggestion: {
    agentId: 'peer',
    sampleSize: 1,
    observedMeanQuizScore: 0,
    evidence: 'observational',
  },
};
function render(observation: DirectorObservation) {
  return renderToStaticMarkup(
    createElement(DirectorObservationNotice, { observation, agentName: 'Peer' }),
  );
}
it('renders one observation and a genuine zero score with the limitation', () => {
  const html = render(observed);
  expect(html).toContain('chat.directorEvidence');
  expect(html).toContain('0%');
  expect(html).toContain('chat.directorLimits');
});
it('distinguishes the control arm from fallback without inventing a sample', () => {
  expect(render({ cohort: 'classic', reason: 'control', suggestion: null })).toContain(
    'chat.directorControl',
  );
  const html = render({ cohort: 'data-driven', reason: 'unavailable-context', suggestion: null });
  expect(html).toContain('chat.directorFallback');
  expect(html).not.toContain('chat.directorEvidence');
});
it('never renders invalid numeric evidence', () => {
  for (const score of [NaN, Infinity, -1, 2]) {
    const html = render({
      ...observed,
      suggestion: { ...observed.suggestion!, observedMeanQuizScore: score },
    });
    expect(html).toContain('chat.directorFallback');
    expect(html).not.toContain('chat.directorEvidence');
  }
});
