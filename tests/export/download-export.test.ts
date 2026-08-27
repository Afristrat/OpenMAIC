import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadExport } from '@/lib/export/download-export';

describe('downloadExport', () => {
  const click = vi.fn();
  const remove = vi.fn();
  const appendChild = vi.fn();
  const anchor = { href: '', download: '', rel: '', click, remove };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    click.mockReset();
    remove.mockReset();
    appendChild.mockReset();
    anchor.href = '';
    anchor.download = '';
    anchor.rel = '';
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qalem-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('télécharge le fichier signé sans faire naviguer la classroom', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, { status: 200 })));

    await downloadExport('https://storage.example/export.mp4?token=signed', 'cours.mp4');

    expect(fetch).toHaveBeenCalledOnce();
    expect(anchor).toMatchObject({
      href: 'blob:qalem-export',
      download: 'cours.mp4',
      rel: 'noopener',
    });
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('signale un téléchargement refusé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(downloadExport('https://storage.example/export.zip', 'cours.zip')).rejects.toThrow(
      'HTTP 403',
    );
    expect(click).not.toHaveBeenCalled();
  });
});
