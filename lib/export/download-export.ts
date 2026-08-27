'use client';

export async function downloadExport(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Export download failed with HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const file = new File([blob], filename, { type: blob.type });
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 40_000);
}
