import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyVisualWatermark,
  buildVisualWatermarkFfmpegArgs,
  buildVisualWatermarkSvg,
  visualWatermarkLabel,
} from '@/lib/transmissions/visual-watermark';

const watermarkId = '0123456789abcdef0123456789abcdef';
const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...args,
  ]);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('visual transmission watermark', () => {
  it('renders the complete opaque 128-bit identifier in a readable overlay', () => {
    const svg = buildVisualWatermarkSvg(watermarkId);

    expect(svg).toContain(visualWatermarkLabel);
    expect(svg).toContain('01234567 89abcdef 01234567 89abcdef');
    expect(svg).toContain('fill-opacity="0.82"');
    expect(svg).toContain('font-family="DejaVu Sans Mono"');
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

  it('renders a real private MP4 derivative with its readable watermark and audio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qalem-visual-watermark-proof-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'source.mp4');
    const framePath = join(directory, 'watermarked-frame.png');

    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=#e11d48:s=1280x720:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:d=1',
      '-shortest',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      sourcePath,
    ]);

    const derivative = await applyVisualWatermark(await readFile(sourcePath), watermarkId);
    const derivativePath = join(directory, 'watermarked.mp4');
    await writeFile(derivativePath, derivative);
    await runFfmpeg(['-ss', '0.5', '-i', derivativePath, '-frames:v', '1', framePath]);

    const { data, info } = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
    const pixel = (info.width * (info.height - 40) + (info.width - 40)) * info.channels;
    const [red, green, blue] = data.subarray(pixel, pixel + 3);
    expect(derivative.subarray(4, 8).toString()).toBe('ftyp');
    expect([red, green, blue].every((channel) => channel < 30)).toBe(true);

    const { stdout } = await execFileAsync(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        derivativePath,
      ],
    );
    expect(stdout.trim()).toBe('audio');
  }, 30_000);
});
