import { spawn } from 'node:child_process';

const AUDIO_PROBE_TIMEOUT_MS = 15_000;

export async function measureAudioDurationSeconds(
  audio: Uint8Array | Buffer | Blob,
): Promise<number> {
  const bytes = audio instanceof Blob ? new Uint8Array(await audio.arrayBuffer()) : audio;
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
