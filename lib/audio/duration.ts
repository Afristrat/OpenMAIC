import { spawn } from 'node:child_process';

const AUDIO_PROBE_TIMEOUT_MS = 15_000;

function readAscii(bytes: Uint8Array | Buffer, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Les WAV RIFF déclarent leur débit et la taille du chunk audio. Leur durée
 * peut donc être mesurée sans envoyer plusieurs mégaoctets à ffprobe par un
 * pipe que celui-ci est libre de fermer dès la lecture de l'en-tête.
 */
function measureWavDurationSeconds(bytes: Uint8Array | Buffer): number | null {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | null = null;
  let dataLength: number | null = null;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    if (chunkDataEnd > bytes.length) return null;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      byteRate = view.getUint32(chunkDataStart + 8, true);
    } else if (chunkId === 'data') {
      dataLength = chunkSize;
    }

    if (byteRate !== null && dataLength !== null) break;
    offset = chunkDataEnd + (chunkSize % 2);
  }

  if (!byteRate || dataLength === null || dataLength <= 0) return null;
  const duration = dataLength / byteRate;
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(6)) : null;
}

export async function measureAudioDurationSeconds(
  audio: Uint8Array | Buffer | Blob,
): Promise<number> {
  const bytes = audio instanceof Blob ? new Uint8Array(await audio.arrayBuffer()) : audio;
  const wavDuration = measureWavDurationSeconds(bytes);
  if (wavDuration !== null) return wavDuration;

  return new Promise((resolve, reject) => {
    const ffprobe = spawn(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      '-i',
      'pipe:0',
    ]);
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      ffprobe.kill('SIGKILL');
      reject(new Error(`Audio duration probe timed out after ${AUDIO_PROBE_TIMEOUT_MS} ms`));
    }, AUDIO_PROBE_TIMEOUT_MS);

    ffprobe.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    ffprobe.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    ffprobe.stdin.on('error', (error) => {
      if (settled) return;
      // ffprobe may close stdin as soon as it has read enough container metadata
      // to determine the duration. Large, valid WAV files can therefore produce
      // EPIPE while ffprobe still exits successfully with a usable duration.
      if ((error as NodeJS.ErrnoException).code === 'EPIPE') return;
      settled = true;
      clearTimeout(timeout);
      ffprobe.kill('SIGKILL');
      reject(new Error(`Audio duration probe input failed: ${error.message}`));
    });
    ffprobe.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Audio duration probe unavailable: ${error.message}`));
    });
    ffprobe.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const duration = Number(Buffer.concat(output).toString('utf8').trim());
      if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim();
        reject(new Error(`Audio duration probe failed${detail ? `: ${detail}` : ''}`));
        return;
      }
      resolve(Number(duration.toFixed(6)));
    });
    ffprobe.stdin.end(bytes);
  });
}
