import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;
const WATERMARK_ID_PATTERN = /^[0-9a-f]{32}$/;

export const visualWatermarkLabel = 'Qalem · transmission individuelle';

function assertWatermarkId(watermarkId: string): void {
  if (!WATERMARK_ID_PATTERN.test(watermarkId)) {
    throw new Error(
      'L’identifiant de watermark visuel doit contenir exactement 128 bits hexadécimaux',
    );
  }
}

export function buildVisualWatermarkSvg(watermarkId: string): string {
  assertWatermarkId(watermarkId);
  const readableId = watermarkId.match(/.{1,8}/g)?.join(' ') ?? watermarkId;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="116" viewBox="0 0 720 116">
  <rect x="0" y="0" width="720" height="116" rx="14" fill="#050816" fill-opacity="0.82"/>
  <rect x="0" y="0" width="8" height="116" rx="4" fill="#d8b4fe"/>
  <text x="30" y="43" fill="#f5f3ff" font-family="sans-serif" font-size="24" font-weight="700">${visualWatermarkLabel}</text>
  <text x="30" y="82" fill="#d8b4fe" font-family="monospace" font-size="26" font-weight="700" letter-spacing="1">${readableId}</text>
</svg>`;
}

export function buildVisualWatermarkFfmpegArgs(params: {
  sourcePath: string;
  overlayPath: string;
  outputPath: string;
}): string[] {
  return [
    '-i',
    params.sourcePath,
    '-i',
    params.overlayPath,
    '-filter_complex',
    '[0:v][1:v]overlay=x=W-w-32:y=H-h-32:format=auto[v]',
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'veryfast',
    '-threads',
    process.env.FFMPEG_THREADS || '4',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    params.outputPath,
  ];
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
  );
}

/**
 * Burns the opaque 128-bit delivery identifier into every video frame.
 * This is deliberately a derivative: callers must preserve the source artifact.
 */
export async function applyVisualWatermark(source: Buffer, watermarkId: string): Promise<Buffer> {
  assertWatermarkId(watermarkId);
  const directory = await mkdtemp(join(tmpdir(), 'qalem-visual-watermark-'));
  const sourcePath = join(directory, 'source.mp4');
  const overlayPath = join(directory, 'watermark.png');
  const outputPath = join(directory, 'watermarked.mp4');

  try {
    await writeFile(sourcePath, source);
    await sharp(Buffer.from(buildVisualWatermarkSvg(watermarkId)))
      .png()
      .toFile(overlayPath);
    await runFfmpeg(buildVisualWatermarkFfmpegArgs({ sourcePath, overlayPath, outputPath }));
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
