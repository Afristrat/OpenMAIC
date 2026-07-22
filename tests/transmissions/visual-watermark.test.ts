import { describe, expect, it } from 'vitest';
import {
  buildVisualWatermarkFfmpegArgs,
  buildVisualWatermarkSvg,
  visualWatermarkLabel,
} from '@/lib/transmissions/visual-watermark';

const watermarkId = '0123456789abcdef0123456789abcdef';

describe('visual transmission watermark', () => {
  it('renders the complete opaque 128-bit identifier in a readable overlay', () => {
    const svg = buildVisualWatermarkSvg(watermarkId);

    expect(svg).toContain(visualWatermarkLabel);
    expect(svg).toContain('01234567 89abcdef 01234567 89abcdef');
    expect(svg).toContain('fill-opacity="0.82"');
  });

  it('rejects any identifier that is not exactly 128 bits of hexadecimal data', () => {
    expect(() => buildVisualWatermarkSvg('not-an-opaque-id')).toThrow(/128 bits/i);
  });

  it('burns the overlay into video frames while preserving the audio stream', () => {
    const args = buildVisualWatermarkFfmpegArgs({
      sourcePath: '/tmp/source.mp4',
      overlayPath: '/tmp/watermark.png',
      outputPath: '/tmp/output.mp4',
    });

    expect(args).toContain('[0:v][1:v]overlay=x=W-w-32:y=H-h-32:format=auto[v]');
    expect(args).toEqual(expect.arrayContaining(['-map', '[v]', '-map', '0:a?', '-c:a', 'copy']));
    expect(args.at(-1)).toBe('/tmp/output.mp4');
  });
});
