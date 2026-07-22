/**
 * Standards-based learning-package builder (S1-007/S1-008).
 *
 * The course viewer is generated once. SCORM 1.2, SCORM 2004 and cmi5 differ
 * only through their tracking adapter; no package invents a local LMS API.
 */

import JSZip from 'jszip';
import { renderSceneContent, escapeHtml } from './scene-to-html';
import {
  trackingAdapters,
  type LearningPackageFormat,
  type TrackingAdapter,
} from './tracking-adapters';
import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

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
}

export interface ScormPackageResult {
  zip: Buffer;
  sceneCount: number;
}

function buildIndexHtml(stage: StageRow, scenes: SceneRow[], adapter: TrackingAdapter): string {
  const isRtl = (stage.language ?? '').toLowerCase().startsWith('ar');
  const title = escapeHtml(stage.name);
  const description = stage.description
    ? `<p class="scorm-course-description">${escapeHtml(stage.description)}</p>`
    : '';
  const fallbackScene = isRtl ? 'مشهد' : 'Scène';
  const missingContent = isRtl
    ? 'المحتوى غير متوفر دون اتصال لهذه الشريحة.'
    : 'Contenu non disponible hors ligne pour ce type de scène.';
  const sections = scenes
    .map((scene, index) => {
      const sceneTitle = escapeHtml(scene.title || `${fallbackScene} ${index + 1}`);
      const body =
        renderSceneContent(scene.content) ||
        `<p class="scorm-empty">${escapeHtml(missingContent)}</p>`;
      return `<section class="scorm-scene" data-index="${index}" style="display:${index === 0 ? 'block' : 'none'}">
  <h2>${sceneTitle}</h2>
  ${body}
</section>`;
    })
    .join('\n');
  const labels = isRtl
    ? {
        previous: 'السابق',
        next: 'التالي',
        complete: 'وضع علامة كمكتمل',
        done: 'تم وضع علامة على هذه الدورة كمكتملة.',
      }
    : {
        previous: 'Précédent',
        next: 'Suivant',
        complete: 'Marquer comme terminé',
        done: 'Ce cours a été marqué comme terminé.',
      };

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'fr'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; max-width: 860px; margin-inline: auto; line-height: 1.5; }
  .scorm-nav { display: flex; justify-content: space-between; margin-top: 2rem; gap: 1rem; }
  .scorm-nav button, .scorm-complete button { padding: 0.6rem 1.2rem; border: 1px solid #333; background: #fff; cursor: pointer; border-radius: 4px; }
  .scorm-nav button:disabled, .scorm-complete button:disabled { opacity: 0.4; cursor: default; }
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

  try {
${adapter.buildTrackingScript()}
  } catch (error) {
    trackingError = error;
    completeBtn.disabled = true;
    statusEl.textContent = 'Le suivi LMS est indisponible : aucune complétion ne sera déclarée.';
    console.error('Qalem tracking initialisation failed', error);
  }

  function track(method, value) {
    if (trackingError || !window.qalemTracking) return;
    try {
      var result = window.qalemTracking[method](value);
      if (result && typeof result.catch === 'function') result.catch(function (error) { console.error('Qalem tracking failed', error); });
    } catch (error) {
      console.error('Qalem tracking failed', error);
    }
  }
  function render() {
    scenes.forEach(function (element, index) { element.style.display = index === current ? 'block' : 'none'; });
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === scenes.length - 1;
    progress.textContent = (current + 1) + ' / ' + scenes.length;
    track('location', String(current));
  }

  prevBtn.addEventListener('click', function () { if (current > 0) { current -= 1; render(); } });
  nextBtn.addEventListener('click', function () { if (current < scenes.length - 1) { current += 1; render(); } });
  completeBtn.addEventListener('click', function () { track('complete'); statusEl.textContent = ${JSON.stringify(labels.done)}; });
  window.addEventListener('beforeunload', function () { track('terminate'); });
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
): Promise<ScormPackageResult> {
  if (scenes.length === 0) throw new Error('Le cours ne contient aucune scène à exporter');

  const adapter = trackingAdapters[format];
  const manifest = adapter.buildManifest({
    identifier: `com.qalem.export.${stage.id}`,
    title: stage.name,
    description: stage.description ?? stage.name,
    language: stage.language ?? 'fr-FR',
    launchUrl: 'index.html',
    resourceFiles: ['index.html'],
  });
  const zip = new JSZip();
  zip.file(adapter.manifestFilename, manifest);
  zip.file('index.html', buildIndexHtml(stage, scenes, adapter));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  log.info(
    `Built ${format} package for stage=${stage.id}: ${scenes.length} scenes, ${buffer.length} bytes`,
  );
  return { zip: buffer, sceneCount: scenes.length };
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
    .select('id, type, title, order, content')
    .eq('stage_id', stageId)
    .order('order', { ascending: true });
  if (scenesError)
    throw new Error(`Échec de lecture des scènes pour l'export : ${scenesError.message}`);
  if (!scenesData || scenesData.length === 0)
    throw new Error('Le cours ne contient aucune scène à exporter');
  return buildLearningPackageFromData(stageData as StageRow, scenesData as SceneRow[], format);
}

export async function buildScormPackage(stageId: string): Promise<ScormPackageResult> {
  return buildLearningPackage(stageId, 'scorm12');
}
