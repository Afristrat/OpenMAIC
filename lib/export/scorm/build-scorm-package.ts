/**
 * Standards-based learning-package builder (S1-007/S1-008).
 *
 * The course viewer is generated once. SCORM 1.2, SCORM 2004 and cmi5 differ
 * only through their tracking adapter; no package invents a local LMS API.
 */

import JSZip from 'jszip';
import sharp from 'sharp';
import { renderSceneContent, escapeHtml } from './scene-to-html';
import {
  trackingAdapters,
  type LearningPackageFormat,
  type TrackingAdapter,
} from './tracking-adapters';
import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  assertExportAudioAboveNoiseFloor,
  audioFormatFromStoragePath,
  collectSceneSpeechActions,
  storagePathFromAudioUrl,
} from '@/lib/export/mp4/build-classroom-video';
import { buildSceneCardSvg } from '@/lib/export/mp4/scene-card';

const log = createLogger('ScormExport');

export interface StageRow {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
}

export interface SceneRow {
  id: string;
  type: string;
  title: string | null;
  order: number;
  content: unknown;
  actions: unknown;
}

export interface ScormPackageResult {
  zip: Buffer;
  sceneCount: number;
}

export interface LearningPackageAudioAsset {
  data: Uint8Array;
  extension: string;
}

export interface LearningPackageMedia {
  snapshots?: ReadonlyMap<string, Uint8Array>;
  audio?: ReadonlyMap<string, readonly LearningPackageAudioAsset[]>;
}

interface PreparedSceneMedia {
  snapshotPath: string;
  audioPaths: string[];
}

interface PreparedPackageMedia {
  files: Map<string, Uint8Array>;
  scenes: Map<string, PreparedSceneMedia>;
}

function safeExtension(value: string): string {
  return /^[a-z0-9]{1,8}$/i.test(value) ? value.toLowerCase() : 'bin';
}

async function preparePackageMedia(
  stage: StageRow,
  scenes: SceneRow[],
  media: LearningPackageMedia,
): Promise<PreparedPackageMedia> {
  const files = new Map<string, Uint8Array>();
  const preparedScenes = new Map<string, PreparedSceneMedia>();

  for (const [sceneIndex, scene] of scenes.entries()) {
    const snapshotPath = `assets/scenes/scene-${sceneIndex + 1}.png`;
    const suppliedSnapshot = media.snapshots?.get(scene.id);
    const snapshotSource =
      suppliedSnapshot ??
      Buffer.from(
        buildSceneCardSvg({
          classroomName: stage.name,
          sceneTitle: scene.title || `Scène ${sceneIndex + 1}`,
          sceneType: scene.type,
          sceneNumber: sceneIndex + 1,
          sceneCount: scenes.length,
          content: scene.content,
        }),
      );
    const snapshot = new Uint8Array(await sharp(snapshotSource).png().toBuffer());
    files.set(snapshotPath, snapshot);

    const audioPaths: string[] = [];
    for (const [audioIndex, asset] of (media.audio?.get(scene.id) ?? []).entries()) {
      const audioPath = `assets/audio/scene-${sceneIndex + 1}-${audioIndex + 1}.${safeExtension(asset.extension)}`;
      files.set(audioPath, asset.data);
      audioPaths.push(audioPath);
    }
    preparedScenes.set(scene.id, { snapshotPath, audioPaths });
  }

  return { files, scenes: preparedScenes };
}

function buildIndexHtml(
  stage: StageRow,
  scenes: SceneRow[],
  adapter: TrackingAdapter,
  media: ReadonlyMap<string, PreparedSceneMedia>,
): string {
  const language = (stage.language ?? 'fr-FR').toLowerCase();
  const isRtl = language.startsWith('ar');
  const isEnglish = language.startsWith('en');
  const title = escapeHtml(stage.name);
  const description = stage.description
    ? `<p class="scorm-course-description">${escapeHtml(stage.description)}</p>`
    : '';
  const fallbackScene = isRtl ? 'مشهد' : isEnglish ? 'Scene' : 'Scène';
  const missingContent = isRtl
    ? 'المحتوى غير متوفر دون اتصال لهذه الشريحة.'
    : isEnglish
      ? 'Offline content is unavailable for this scene type.'
      : 'Contenu non disponible hors ligne pour ce type de scène.';
  const staticWidgetNotice = isRtl
    ? 'يُعرض المحتوى التفاعلي في صورة ثابتة.'
    : isEnglish
      ? 'Interactive content is shown as a static capture.'
      : 'Widget présenté sous forme de capture statique.';
  const sections = scenes
    .map((scene, index) => {
      const sceneTitle = escapeHtml(scene.title || `${fallbackScene} ${index + 1}`);
      const sceneMedia = media.get(scene.id);
      const body =
        renderSceneContent(scene.content, { staticWidgetNotice }) ||
        `<p class="scorm-empty">${escapeHtml(missingContent)}</p>`;
      const snapshot = sceneMedia
        ? `<img class="scorm-scene-capture" src="${escapeHtml(sceneMedia.snapshotPath)}" alt="${sceneTitle}" />`
        : '';
      const audio = (sceneMedia?.audioPaths ?? [])
        .map(
          (path, audioIndex) =>
            `<audio class="scorm-scene-audio" controls preload="metadata" src="${escapeHtml(path)}">Audio ${audioIndex + 1}</audio>`,
        )
        .join('\n');
      return `<section class="scorm-scene" data-index="${index}" style="display:${index === 0 ? 'block' : 'none'}">
  <h2>${sceneTitle}</h2>
  ${snapshot}
  ${body}
  ${audio}
</section>`;
    })
    .join('\n');
  const labels = isRtl
    ? {
        previous: 'السابق',
        next: 'التالي',
        complete: 'وضع علامة كمكتمل',
        done: 'تم وضع علامة على هذه الدورة كمكتملة.',
        trackingUnavailable: 'تعذّر تأكيد الإكمال من نظام إدارة التعلم.',
      }
    : isEnglish
      ? {
          previous: 'Previous',
          next: 'Next',
          complete: 'Mark as complete',
          done: 'This course has been marked as complete.',
          trackingUnavailable: 'The LMS could not confirm completion.',
        }
      : {
          previous: 'Précédent',
          next: 'Suivant',
          complete: 'Marquer comme terminé',
          done: 'Ce cours a été marqué comme terminé.',
          trackingUnavailable: 'Le LMS n’a pas pu confirmer la complétion.',
        };

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : isEnglish ? 'en' : 'fr'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; max-width: 860px; margin-inline: auto; line-height: 1.5; }
  .scorm-nav { display: flex; justify-content: space-between; margin-top: 2rem; gap: 1rem; }
  .scorm-nav button, .scorm-complete button { padding: 0.6rem 1.2rem; border: 1px solid #333; background: #fff; cursor: pointer; border-radius: 4px; }
  .scorm-nav button:disabled, .scorm-complete button:disabled { opacity: 0.4; cursor: default; }
  .scorm-scene-capture { display: block; width: 100%; height: auto; border-radius: 0.5rem; }
  .scorm-scene-audio { display: block; width: 100%; margin-top: 1rem; }
  .scorm-scene-transcript { margin-top: 1rem; white-space: pre-wrap; }
  .scorm-progress, .scorm-complete, .scorm-status { text-align: center; margin-top: 0.5rem; }
  .scorm-status { font-size: 0.9rem; color: #2a7a2a; }
</style>
</head>
<body>
<h1>${title}</h1>
${description}
<div id="scorm-scenes">${sections}</div>
<div class="scorm-progress" id="scorm-progress"></div>
<div class="scorm-nav">
  <button id="scorm-prev" type="button">${labels.previous}</button>
  <button id="scorm-next" type="button">${labels.next}</button>
</div>
<div class="scorm-complete">
  <button id="scorm-complete-btn" type="button">${labels.complete}</button>
  <div class="scorm-status" id="scorm-status"></div>
</div>
<script>
(function () {
  var scenes = document.querySelectorAll('.scorm-scene');
  var current = 0;
  var prevBtn = document.getElementById('scorm-prev');
  var nextBtn = document.getElementById('scorm-next');
  var progress = document.getElementById('scorm-progress');
  var completeBtn = document.getElementById('scorm-complete-btn');
  var statusEl = document.getElementById('scorm-status');
  var trackingError = null;
  var trackingTerminated = false;

  try {
${adapter.buildTrackingScript()}
  } catch (error) {
    trackingError = error;
    completeBtn.disabled = true;
    statusEl.textContent = ${JSON.stringify(labels.trackingUnavailable)};
    console.error('Qalem tracking initialisation failed', error);
  }

  function track(method, value) {
    if (trackingError || !window.qalemTracking) return Promise.reject(trackingError || new Error('LMS tracking unavailable'));
    try {
      var result = window.qalemTracking[method](value);
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  function trackInBackground(method, value) {
    track(method, value).catch(function (error) { console.error('Qalem tracking failed', error); });
  }
  function terminateTracking() {
    if (trackingTerminated) return Promise.resolve();
    trackingTerminated = true;
    return track('terminate').catch(function (error) {
      trackingTerminated = false;
      throw error;
    });
  }
  function terminateTrackingInBackground() {
    terminateTracking().catch(function (error) { console.error('Qalem tracking failed', error); });
  }
  function render() {
    scenes.forEach(function (element, index) { element.style.display = index === current ? 'block' : 'none'; });
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === scenes.length - 1;
    progress.textContent = (current + 1) + ' / ' + scenes.length;
    trackInBackground('location', String(current));
  }

  prevBtn.addEventListener('click', function () { if (current > 0) { current -= 1; render(); } });
  nextBtn.addEventListener('click', function () { if (current < scenes.length - 1) { current += 1; render(); } });
  completeBtn.addEventListener('click', function () {
    completeBtn.disabled = true;
    track('complete').then(terminateTracking).then(function () {
      statusEl.textContent = ${JSON.stringify(labels.done)};
    }).catch(function (error) {
      statusEl.textContent = ${JSON.stringify(labels.trackingUnavailable)};
      console.error('Qalem tracking failed', error);
    });
  });
  window.addEventListener('pagehide', terminateTrackingInBackground);
  window.addEventListener('beforeunload', terminateTrackingInBackground);
  render();
}());
</script>
</body>
</html>`;
}

export async function buildLearningPackageFromData(
  stage: StageRow,
  scenes: SceneRow[],
  format: LearningPackageFormat = 'scorm12',
  media: LearningPackageMedia = {},
): Promise<ScormPackageResult> {
  if (scenes.length === 0) throw new Error('Le cours ne contient aucune scène à exporter');

  const adapter = trackingAdapters[format];
  const preparedMedia = await preparePackageMedia(stage, scenes, media);
  const resourceFiles = ['index.html', ...preparedMedia.files.keys()];
  const manifest = adapter.buildManifest({
    identifier: `com.qalem.export.${stage.id}`,
    title: stage.name,
    description: stage.description ?? stage.name,
    language: stage.language ?? 'fr-FR',
    launchUrl: 'index.html',
    resourceFiles,
  });
  const zip = new JSZip();
  zip.file(adapter.manifestFilename, manifest);
  zip.file('index.html', buildIndexHtml(stage, scenes, adapter, preparedMedia.scenes));
  for (const [path, data] of preparedMedia.files) zip.file(path, data);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  log.info(
    `Built ${format} package for stage=${stage.id}: ${scenes.length} scenes, ${buffer.length} bytes`,
  );
  return { zip: buffer, sceneCount: scenes.length };
}

async function loadPersistentMedia(
  stageId: string,
  scenes: SceneRow[],
): Promise<LearningPackageMedia> {
  const storage = createServiceSupabaseClient().storage.from('classroom-media');
  const snapshots = new Map<string, Uint8Array>();
  const audio = new Map<string, LearningPackageAudioAsset[]>();

  for (const [sceneIndex, scene] of scenes.entries()) {
    const { data: snapshot } = await storage.download(`${stageId}/export/${scene.id}.png`);
    if (snapshot) snapshots.set(scene.id, new Uint8Array(await snapshot.arrayBuffer()));

    const speechActions = collectSceneSpeechActions(scene.actions);
    const missingAudio = speechActions.filter((action) => action.text && !action.audioUrl);
    if (missingAudio.length > 0) {
      throw new Error(
        `Export LMS refusé : ${missingAudio.length} prise(s) de parole sans audio dans la scène ${sceneIndex + 1}`,
      );
    }

    const sceneAudio: LearningPackageAudioAsset[] = [];
    for (const action of speechActions) {
      if (!action.audioUrl) continue;
      const storagePath = storagePathFromAudioUrl(stageId, action.audioUrl);
      if (!storagePath) {
        throw new Error(
          `Export LMS refusé : URL audio non persistante dans la scène ${sceneIndex + 1}`,
        );
      }
      const { data, error } = await storage.download(storagePath);
      if (error || !data) throw new Error(`Audio indisponible pour l'export LMS : ${storagePath}`);
      const bytes = new Uint8Array(await data.arrayBuffer());
      await assertExportAudioAboveNoiseFloor(bytes, storagePath);
      sceneAudio.push({ data: bytes, extension: audioFormatFromStoragePath(storagePath) });
    }
    if (sceneAudio.length > 0) audio.set(scene.id, sceneAudio);
  }

  return { snapshots, audio };
}

export async function buildScormPackageFromData(
  stage: StageRow,
  scenes: SceneRow[],
): Promise<ScormPackageResult> {
  return buildLearningPackageFromData(stage, scenes, 'scorm12');
}

export async function buildLearningPackage(
  stageId: string,
  format: LearningPackageFormat = 'scorm12',
): Promise<ScormPackageResult> {
  const supabase = createServiceSupabaseClient();
  const { data: stageData, error: stageError } = await supabase
    .from('stages')
    .select('id, name, description, language')
    .eq('id', stageId)
    .single();
  if (stageError || !stageData) {
    throw new Error(`Cours introuvable pour l'export : ${stageError?.message ?? stageId}`);
  }
  const { data: scenesData, error: scenesError } = await supabase
    .from('scenes')
    .select('id, type, title, order, content, actions')
    .eq('stage_id', stageId)
    .order('order', { ascending: true });
  if (scenesError)
    throw new Error(`Échec de lecture des scènes pour l'export : ${scenesError.message}`);
  if (!scenesData || scenesData.length === 0)
    throw new Error('Le cours ne contient aucune scène à exporter');
  const scenes = scenesData as SceneRow[];
  const media = await loadPersistentMedia(stageId, scenes);
  return buildLearningPackageFromData(stageData as StageRow, scenes, format, media);
}

export async function buildScormPackage(stageId: string): Promise<ScormPackageResult> {
  return buildLearningPackage(stageId, 'scorm12');
}
