'use client';

import { saveAs } from 'file-saver';

export async function downloadExport(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Export download failed with HTTP ${response.status}`);
  }
  const blob = await response.blob();
  // Preserve the name in both channels understood by browser download
  // implementations: File.name and the explicit saveAs argument.
  saveAs(new File([blob], filename, { type: blob.type }), filename);
}
