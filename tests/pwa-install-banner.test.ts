import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isIosDevice, isStandalone } from '@/components/pwa-install-banner';

describe('PWA install banner', () => {
  it('recognizes iOS, iPadOS desktop mode, and installed display modes', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5)).toBe(false);
    expect(isStandalone(true, false)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
  });

  it('declares real 192 px and 512 px PNG install icons', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/manifest.json'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    for (const size of [192, 512]) {
      expect(manifest.icons).toContainEqual({
        src: `/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
      });
      const png = readFileSync(resolve(`public/icon-${size}.png`));
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });
});
