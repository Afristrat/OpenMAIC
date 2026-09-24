import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadExport } from '@/lib/export/download-export';

describe('downloadExport', () => {
  let anchor: {
    href: string;
    download: string;
    rel: string;
    hidden: boolean;
    isConnected: boolean;
    click: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    anchor = {
      href: '',
      download: '',
      rel: '',
      hidden: false,
      isConnected: false,
      click: vi.fn(),
      remove: vi.fn(() => {
        anchor.isConnected = false;
      }),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: {
        append: vi.fn(() => {
          anchor.isConnected = true;
        }),
      },
    });
  });

  it('télécharge le fichier signé sans faire naviguer la classroom', async () => {
    await downloadExport('https://storage.example/export.mp4?token=signed', 'cours.mp4');

    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('cours.mp4');
    expect(anchor.href).toBe('https://storage.example/export.mp4?token=signed');
    expect(anchor.isConnected).toBe(false);
  });

  it('ne conserve aucune ancre temporaire après le déclenchement', async () => {
    await downloadExport('https://storage.example/export.zip?token=signed', 'cours.zip');

    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(anchor.isConnected).toBe(false);
  });
});
