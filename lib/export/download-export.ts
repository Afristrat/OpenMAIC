'use client';

import { saveAs } from 'file-saver';

export async function downloadExport(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Export download failed with HTTP ${response.status}`);
  }
  saveAs(await response.blob(), filename);
}
