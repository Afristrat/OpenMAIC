import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn<() => Promise<boolean>>(),
  stage: { id: 'classroom-1' } as { id: string } | null,
}));

vi.mock('@/lib/edit/classroom-persistence', () => ({
  flushClassroomPersistence: mocks.flush,
}));
vi.mock('@/lib/store/stage', () => ({
  useStageStore: { getState: () => ({ stage: mocks.stage, scenes: [] }) },
}));

import { persistCurrentClassroomForExport } from '@/lib/export/persist-before-server-export';

describe('enregistrement avant un export serveur', () => {
  beforeEach(() => {
    mocks.flush.mockReset().mockResolvedValue(true);
    mocks.stage = { id: 'classroom-1' };
    vi.unstubAllGlobals();
  });

  it('passe par la file d’enregistrement, jamais par un PUT parallèle', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await persistCurrentClassroomForExport();

    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('échoue si la file n’a pas pu enregistrer la formation', async () => {
    mocks.flush.mockResolvedValue(false);
    await expect(persistCurrentClassroomForExport()).rejects.toThrow(
      'Échec de la synchronisation avant export',
    );
  });

  it('échoue sans formation ouverte', async () => {
    mocks.stage = null;
    await expect(persistCurrentClassroomForExport()).rejects.toThrow('Classroom introuvable');
    expect(mocks.flush).not.toHaveBeenCalled();
  });
});
