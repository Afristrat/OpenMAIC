import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveAsMock } = vi.hoisted(() => ({ saveAsMock: vi.fn() }));

vi.mock('file-saver', () => ({ saveAs: saveAsMock }));

import { downloadExport } from '@/lib/export/download-export';

describe('downloadExport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    saveAsMock.mockReset();
  });

  it('télécharge le fichier signé sans faire naviguer la classroom', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, { status: 200 })));

    await downloadExport('https://storage.example/export.mp4?token=signed', 'cours.mp4');

    expect(fetch).toHaveBeenCalledOnce();
    expect(saveAsMock).toHaveBeenCalledWith(expect.any(Blob), 'cours.mp4');
  });

  it('signale un téléchargement refusé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(downloadExport('https://storage.example/export.zip', 'cours.zip')).rejects.toThrow(
      'HTTP 403',
    );
    expect(saveAsMock).not.toHaveBeenCalled();
  });
});
