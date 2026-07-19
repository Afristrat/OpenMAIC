import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

interface SpeechAction {
  type?: string;
  text?: string;
  audioUrl?: string;
}

function storagePathFromAudioUrl(stageId: string, audioUrl: string): string | null {
  const marker = `/api/classroom-media/${encodeURIComponent(stageId)}/`;
  const index = audioUrl.indexOf(marker);
  return index === -1 ? null : `${stageId}/${decodeURIComponent(audioUrl.slice(index + marker.length))}`;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function downloadSceneAudio(
  stageId: string,
  actions: unknown,
  directory: string,
  sceneIndex: number,
): Promise<string[]> {
  const supabase = createServiceSupabaseClient();
  const speechActions = Array.isArray(actions)
    ? (actions as SpeechAction[]).filter((action) => action.type === 'speech')
    : [];
  const missingAudioCount = speechActions.filter((action) => action.text && !action.audioUrl).length;
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
    const localPath = join(directory, `scene-${sceneIndex}-audio-${audioIndex}.wav`);
    await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
    paths.push(localPath);
  }
  return paths;
}

async function renderSceneSegment(params: {
  directory: string;
  stageId: string;
  scene: { id: string; actions: unknown };
  sceneIndex: number;
}): Promise<string> {
  const imagePath = join(params.directory, `scene-${params.sceneIndex}.png`);
  const segmentPath = join(params.directory, `scene-${params.sceneIndex}.mp4`);
  const snapshotPath = `${params.stageId}/export/${params.scene.id}.png`;
  const { data: snapshot, error: snapshotError } = await createServiceSupabaseClient().storage
    .from('classroom-media')
    .download(snapshotPath);
  if (snapshotError || !snapshot) {
    throw new Error(`Export MP4 refusé : rendu réel absent pour la scène ${params.sceneIndex + 1}`);
  }
  await writeFile(imagePath, Buffer.from(await snapshot.arrayBuffer()));

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
      '-loop', '1', '-i', imagePath,
      ...inputs,
      '-filter_complex', `${audioLabels}concat=n=${audioPaths.length}:v=0:a=1[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
      '-threads', process.env.FFMPEG_THREADS || '4',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-pix_fmt', 'yuv420p', '-r', '25', '-shortest',
      '-movflags', '+faststart', segmentPath,
    ]);
  } else {
    await runFfmpeg([
      '-loop', '1', '-i', imagePath,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-t', '5', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
      '-threads', process.env.FFMPEG_THREADS || '4',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-pix_fmt', 'yuv420p', '-r', '25', '-shortest',
      '-movflags', '+faststart', segmentPath,
    ]);
  }
  return segmentPath;
}

export async function buildClassroomVideo(stageId: string): Promise<{ video: Buffer; sceneCount: number }> {
  const supabase = createServiceSupabaseClient();
  const [{ data: stage, error: stageError }, { data: scenes, error: scenesError }] = await Promise.all([
    supabase.from('stages').select('id, name').eq('id', stageId).single(),
    supabase.from('scenes').select('id, title, type, content, actions, order').eq('stage_id', stageId).order('order'),
  ]);
  if (stageError || !stage) throw new Error(`Cours introuvable pour l'export MP4: ${stageId}`);
  if (scenesError || !scenes?.length) throw new Error(`Aucune scène exportable pour le cours ${stageId}`);

  const directory = await mkdtemp(join(tmpdir(), 'qalem-mp4-'));
  try {
    const segments: string[] = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      segments.push(await renderSceneSegment({
        directory,
        stageId,
        scene: scene as { id: string; actions: unknown },
        sceneIndex,
      }));
    }

    const concatFile = join(directory, 'segments.txt');
    await writeFile(concatFile, segments.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'));
    const outputPath = join(directory, 'classroom.mp4');
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    const video = await import('node:fs/promises').then((fs) => fs.readFile(outputPath));
    return { video, sceneCount: scenes.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
