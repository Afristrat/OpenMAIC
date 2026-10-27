import { describe, expect, it } from 'vitest';
import { describeExportStatus, formatElapsed, progressPercent } from '@/lib/export/export-progress';

describe('progressPercent', () => {
  it('calcule le pourcentage du rendu scène par scène', () => {
    expect(progressPercent({ phase: 'rendering', done: 3, total: 17 })).toBe(18);
    expect(progressPercent({ phase: 'rendering', done: 17, total: 17 })).toBe(100);
    expect(progressPercent({ phase: 'rendering', done: 0, total: 17 })).toBe(0);
  });

  it("n'invente rien quand l'avancement n'est pas mesurable", () => {
    expect(progressPercent(null)).toBeNull();
    expect(progressPercent({ phase: null, done: null, total: null })).toBeNull();
    expect(progressPercent({ phase: 'assembling', done: 17, total: 17 })).toBeNull();
    expect(progressPercent({ phase: 'rendering', done: 1, total: 0 })).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('affiche m:ss puis h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(12 * 60_000 + 3_000)).toBe('12:03');
    expect(formatElapsed(3_600_000 + 5 * 60_000 + 9_000)).toBe('1:05:09');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('describeExportStatus', () => {
  const rendering = { phase: 'rendering' as const, done: 3, total: 17 };

  it('dit que le rendu attend son tour quand il est en file', () => {
    expect(describeExportStatus({ status: 'queued', progress: null, elapsedMs: 5_000 }).key).toBe(
      'export.videoQueued',
    );
  });

  it('donne la scène en cours, le pourcentage et le temps écoulé', () => {
    expect(
      describeExportStatus({ status: 'generating', progress: rendering, elapsedMs: 312_000 }),
    ).toEqual({
      key: 'export.videoProgress',
      values: { done: 3, total: 17, percent: 18, elapsed: '5:12' },
    });
  });

  it("distingue l'assemblage et le dépôt", () => {
    expect(
      describeExportStatus({
        status: 'generating',
        progress: { phase: 'assembling', done: 17, total: 17 },
        elapsedMs: 1_000,
      }).key,
    ).toBe('export.videoAssembling');
    expect(
      describeExportStatus({
        status: 'generating',
        progress: { phase: 'uploading', done: null, total: null },
        elapsedMs: 1_000,
      }).key,
    ).toBe('export.videoUploading');
  });

  it("annonce un démarrage tant que le serveur n'a rien remonté", () => {
    expect(
      describeExportStatus({ status: 'generating', progress: null, elapsedMs: 1_000 }).key,
    ).toBe('export.videoStarting');
  });
});
