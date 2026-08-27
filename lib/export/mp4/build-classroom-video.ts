import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { assertAboveNoiseFloor } from '@/lib/audio/audio-gate';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { buildSceneCardSvg } from './scene-card';
import type { SpeechAction } from '@/lib/types/action';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

export function collectSceneSpeechActions(actions: unknown): SpeechAction[] {
  return Array.isArray(actions)
    ? actions.filter(
        (action): action is SpeechAction =>
          Boolean(action) && typeof action === 'object' && action.type === 'speech',
      )
    : [];
}

export function storagePathFromAudioUrl(stageId: string, audioUrl: string): string | null {
  const marker = `/api/classroom-media/${encodeURIComponent(stageId)}/`;
  const pathname = new URL(audioUrl, 'https://qalem.invalid').pathname;
  const index = pathname.indexOf(marker);
  return index === -1
    ? null
    : `${stageId}/${decodeURIComponent(pathname.slice(index + marker.length))}`;
}

export function audioFormatFromStoragePath(storagePath: string): string {
  return storagePath.split('.').pop()?.toLowerCase() || '';
}

export async function assertExportAudioAboveNoiseFloor(
  audio: Uint8Array,
  storagePath: string,
): Promise<void> {
  await assertAboveNoiseFloor(audio, audioFormatFromStoragePath(storagePath));
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

async function downloadSceneAudio(
  stageId: string,
  actions: unknown,
  directory: string,
  sceneIndex: number,
): Promise<string[]> {
  const supabase = createServiceSupabaseClient();
  const speechActions = collectSceneSpeechActions(actions);
  const missingAudioCount = speechActions.filter(
    (action) => action.text && !action.audioUrl,
  ).length;
  if (missingAudioCount > 0) {
    throw new Error(
      `Export MP4 refusé : ${missingAudioCount} prise(s) de parole sans audio dans la scène ${sceneIndex + 1}`,
    );
  }
  const paths: string[] = [];

  for (const [audioIndex, action] of speechActions.filter((item) => item.audioUrl).entries()) {
    const storagePath = storagePathFromAudioUrl(stageId, action.audioUrl!);
    if (!storagePath) continue;
    const { data, error } = await supabase.storage.from('classroom-media').download(storagePath);
    if (error || !data) throw new Error(`Audio indisponible pour l'export MP4: ${storagePath}`);
    const audio = new Uint8Array(await data.arrayBuffer());
    await assertExportAudioAboveNoiseFloor(audio, storagePath);
    const format = audioFormatFromStoragePath(storagePath);
    const localPath = join(directory, `scene-${sceneIndex}-audio-${audioIndex}.${format}`);
    await writeFile(localPath, audio);
    paths.push(localPath);
  }
  return paths;
}

async function renderSceneSegment(params: {
  directory: string;
  stageId: string;
  classroomName: string;
  sceneCount: number;
  scene: { id: string; title: string; type: string; content: unknown; actions: unknown };
  sceneIndex: number;
}): Promise<string> {
  const imagePath = join(params.directory, `scene-${params.sceneIndex}.png`);
  const segmentPath = join(params.directory, `scene-${params.sceneIndex}.mp4`);
  const snapshotPath = `${params.stageId}/export/${params.scene.id}.png`;
  const { data: snapshot, error: snapshotError } = await createServiceSupabaseClient()
    .storage.from('classroom-media')
    .download(snapshotPath);
  if (snapshotError || !snapshot) {
    await sharp(
      Buffer.from(
        buildSceneCardSvg({
          classroomName: params.classroomName,
          sceneTitle: params.scene.title,
          sceneType: params.scene.type,
          sceneNumber: params.sceneIndex + 1,
          sceneCount: params.sceneCount,
          content: params.scene.content,
        }),
      ),
    )
      .png()
      .toFile(imagePath);
  } else {
    await writeFile(imagePath, Buffer.from(await snapshot.arrayBuffer()));
  }

  const audioPaths = await downloadSceneAudio(
    params.stageId,
    params.scene.actions,
    params.directory,
    params.sceneIndex,
  );
  const inputs = audioPaths.flatMap((path) => ['-i', path]);

  if (audioPaths.length) {
    const audioLabels = audioPaths.map((_, index) => `[${index + 1}:a]`).join('');
    await runFfmpeg([
      '-loop',
      '1',
      '-i',
      imagePath,
      ...inputs,
      '-filter_complex',
      `${audioLabels}concat=n=${audioPaths.length}:v=0:a=1[a]`,
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'stillimage',
      '-threads',
      process.env.FFMPEG_THREADS || '4',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '25',
      '-shortest',
      '-movflags',
      '+faststart',
      segmentPath,
    ]);
  } else {
    await runFfmpeg([
      '-loop',
      '1',
      '-i',
      imagePath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-t',
      '5',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'stillimage',
      '-threads',
      process.env.FFMPEG_THREADS || '4',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '25',
      '-shortest',
      '-movflags',
      '+faststart',
      segmentPath,
    ]);
  }
  return segmentPath;
}

export async function buildClassroomVideo(
  stageId: string,
): Promise<{ video: Buffer; sceneCount: number }> {
  const supabase = createServiceSupabaseClient();
  const [{ data: stage, error: stageError }, { data: scenes, error: scenesError }] =
    await Promise.all([
      supabase.from('stages').select('id, name').eq('id', stageId).single(),
      supabase
        .from('scenes')
        .select('id, title, type, content, actions, order')
        .eq('stage_id', stageId)
        .order('order'),
    ]);
  if (stageError || !stage) throw new Error(`Cours introuvable pour l'export MP4: ${stageId}`);
  if (scenesError || !scenes?.length)
    throw new Error(`Aucune scène exportable pour le cours ${stageId}`);

  const directory = await mkdtemp(join(tmpdir(), 'qalem-mp4-'));
  try {
    const segments: string[] = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      segments.push(
        await renderSceneSegment({
          directory,
          stageId,
          classroomName: stage.name,
          sceneCount: scenes.length,
          scene: scene as {
            id: string;
            title: string;
            type: string;
            content: unknown;
            actions: unknown;
          },
          sceneIndex,
        }),
      );
    }

    const concatFile = join(directory, 'segments.txt');
    await writeFile(
      concatFile,
      segments.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'),
    );
    const outputPath = join(directory, 'classroom.mp4');
    await runFfmpeg([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatFile,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
    const video = await import('node:fs/promises').then((fs) => fs.readFile(outputPath));
    return { video, sceneCount: scenes.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
