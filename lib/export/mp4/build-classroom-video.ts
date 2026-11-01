import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import { assertAboveNoiseFloor } from '@/lib/audio/audio-gate';
import { missingSpeechAudioMessage, summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { chapterFileName } from './chapter-file-name';
import { buildSceneCardSvg } from './scene-card';
import {
  loadOrganizationBillboardBrand,
  renderOrganizationBillboards,
} from './organization-billboards';
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

export interface ClassroomVideoProgress {
  phase: 'rendering' | 'assembling';
  done: number;
  total: number;
}

type ProgressListener = (progress: ClassroomVideoProgress) => void | Promise<void>;

interface RenderedScene {
  title: string | null;
  path: string;
}

/**
 * Rend chaque scène du cours en un MP4 distinct, le temps de `assemble`, puis
 * supprime le dossier de travail. Les deux exports (fichier unique, un fichier
 * par chapitre) partagent ce rendu : seul l'assemblage final diffère.
 */
async function withRenderedScenes<T>(
  stageId: string,
  onProgress: ProgressListener | undefined,
  assemble: (scenes: RenderedScene[], directory: string) => Promise<T>,
): Promise<T> {
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
  // Refused before any rendering work, for the whole course, with the way to fix it.
  const voices = summarizeSpeechAudio(
    scenes as unknown as Parameters<typeof summarizeSpeechAudio>[0],
  );
  if (voices.missing > 0) throw new Error(missingSpeechAudioMessage(voices, 'MP4'));

  const directory = await mkdtemp(join(tmpdir(), 'qalem-mp4-'));
  try {
    const rendered: RenderedScene[] = [];
    await onProgress?.({ phase: 'rendering', done: 0, total: scenes.length });
    for (const [sceneIndex, scene] of scenes.entries()) {
      rendered.push({
        title: typeof scene.title === 'string' ? scene.title : null,
        path: await renderSceneSegment({
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
      });
      await onProgress?.({ phase: 'rendering', done: sceneIndex + 1, total: scenes.length });
    }
    await onProgress?.({ phase: 'assembling', done: scenes.length, total: scenes.length });
    return await assemble(rendered, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Tout le cours en un seul MP4 : la source des transmissions filigranées. */
export async function buildClassroomVideo(
  stageId: string,
  onProgress?: ProgressListener,
): Promise<{ video: Buffer; sceneCount: number }> {
  return withRenderedScenes(stageId, onProgress, async (scenes, directory) => {
    // Cartons d'entrée et de sortie à l'identité de l'organisation (voir sa marque de présentation).
    const billboards = await renderOrganizationBillboards({
      directory,
      brand: await loadOrganizationBillboardBrand(stageId).catch(() => null),
      runFfmpeg,
    });
    const segmentPaths = [
      ...(billboards.entry ? [billboards.entry] : []),
      ...scenes.map(({ path }) => path),
      ...(billboards.exit ? [billboards.exit] : []),
    ];
    const concatFile = join(directory, 'segments.txt');
    await writeFile(
      concatFile,
      segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'),
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
    return { video: await readFile(outputPath), sceneCount: scenes.length };
  });
}

/** Un MP4 par scène (chapitre), réunis dans une archive ZIP numérotée dans l'ordre du cours. */
export async function buildClassroomChapterVideos(
  stageId: string,
  onProgress?: ProgressListener,
): Promise<{ zip: Buffer; sceneCount: number }> {
  return withRenderedScenes(stageId, onProgress, async (scenes) => {
    const archive = new JSZip();
    for (const [index, scene] of scenes.entries()) {
      // Les MP4 sont déjà compressés : on stocke sans recompresser.
      archive.file(chapterFileName(index, scenes.length, scene.title), await readFile(scene.path), {
        compression: 'STORE',
      });
    }
    return {
      zip: await archive.generateAsync({ type: 'nodebuffer', compression: 'STORE' }),
      sceneCount: scenes.length,
    };
  });
}
