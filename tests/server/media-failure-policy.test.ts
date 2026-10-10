import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asPartialMediaFailure,
  describeMediaWarning,
  isMediaDegradeMode,
} from '@/lib/server/media-failure-policy';
import { MediaGenerationPartialError } from '@/lib/server/classroom-media-generation';

afterEach(() => vi.unstubAllEnvs());

describe('isMediaDegradeMode', () => {
  it('reste strict par défaut', () => {
    expect(isMediaDegradeMode()).toBe(false);
    vi.stubEnv('QALEM_MEDIA_FAILURE_MODE', 'strict');
    expect(isMediaDegradeMode()).toBe(false);
  });

  it('ne se déclenche que sur la valeur degrade, quelle que soit la casse', () => {
    vi.stubEnv('QALEM_MEDIA_FAILURE_MODE', ' Degrade ');
    expect(isMediaDegradeMode()).toBe(true);
  });
});

describe('asPartialMediaFailure', () => {
  it('reconnaît l’erreur partielle du module média', () => {
    const error = new MediaGenerationPartialError('échec', { gen_img_ok: '/m/ok.png' }, [
      { type: 'image', elementId: 'gen_img_ko', reason: 'quota' },
    ]);
    expect(asPartialMediaFailure(error)).toEqual({
      mediaMap: { gen_img_ok: '/m/ok.png' },
      failures: [{ type: 'image', elementId: 'gen_img_ko', reason: 'quota' }],
    });
  });

  it('ignore toute autre erreur et les échecs sans détail', () => {
    expect(asPartialMediaFailure(new Error('Storage unavailable'))).toBeNull();
    expect(asPartialMediaFailure(null)).toBeNull();
    expect(asPartialMediaFailure({ mediaMap: {}, failures: [] })).toBeNull();
  });
});

describe('describeMediaWarning', () => {
  it('nomme ce qui manque et la cause, une seule fois', () => {
    expect(
      describeMediaWarning([
        { type: 'image', elementId: 'a', reason: 'quota dépassé' },
        { type: 'image', elementId: 'b', reason: 'quota dépassé' },
        { type: 'video', elementId: 'c', reason: 'sidecar injoignable' },
      ]),
    ).toBe('Cours livré sans 2 images ni 1 vidéo : quota dépassé ; sidecar injoignable');
  });
});
