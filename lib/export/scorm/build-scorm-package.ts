/**
 * SCORM 1.2 package builder (S1-007, couche 1).
 *
 * Server-only: reads a course (stage + scenes) straight from Supabase (no
 * IndexedDB/Dexie dependency — those only exist client-side), renders a
 * self-contained HTML viewer, bundles the vendored `scorm-again` runtime
 * (MIT, see THIRD-PARTY-NOTICES.txt written into the package), and zips the
 * whole thing next to a valid imsmanifest.xml.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildScorm12Manifest } from './imsmanifest';
import { renderSceneContent, escapeHtml } from './scene-to-html';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('ScormExport');

// `createServiceSupabaseClient()` isn't generically typed to `Database` (a
// pre-existing, codebase-wide convention — see workers.ts::videoCapsuleWorker
// casting `capsule.brief as HyperframesBrief` at the same JSONB boundary), so
// rows are narrowed with `as` right after the read rather than left as `any`.
interface StageRow {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
}

interface SceneRow {
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

const nodeRequire = createRequire(import.meta.url);

function resolveScormRuntime(): { source: string; filename: string } {
  const filename = 'scorm12.min.js';
  const path = nodeRequire.resolve(`scorm-again/dist/${filename}`);
  return { source: readFileSync(path, 'utf-8'), filename };
}

function buildIndexHtml(stage: StageRow, scenes: SceneRow[], runtimeFilename: string): string {
  const isRtl = (stage.language ?? '').toLowerCase().startsWith('ar');
  const dir = isRtl ? 'rtl' : 'ltr';
  const title = escapeHtml(stage.name);
  const description = stage.description
    ? `<p class="scorm-course-description">${escapeHtml(stage.description)}</p>`
    : '';

  const sections = scenes
    .map((scene, index) => {
      const sceneTitle = escapeHtml(scene.title || `${isRtl ? 'مشهد' : 'Scène'} ${index + 1}`);
      const body =
        renderSceneContent(scene.content) ||
        `<p class="scorm-empty">${escapeHtml(isRtl ? 'المحتوى غير متوفر في هذه الحزمة.' : 'Contenu non disponible hors ligne pour ce type de scène.')}</p>`;
      return `<section class="scorm-scene" data-index="${index}" style="display:${index === 0 ? 'block' : 'none'}">
        <h2>${sceneTitle}</h2>
        ${body}
      </section>`;
    })
    .join('\n');

  const labelPrev = isRtl ? 'التالي' : 'Précédent';
  const labelNext = isRtl ? 'السابق' : 'Suivant';
  const labelComplete = isRtl ? 'وضع علامة مكتمل' : 'Marquer comme terminé';
  const labelDone = isRtl ? 'تم وضع علامة على هذه الدورة كمكتملة.' : 'Ce cours a été marqué comme terminé.';

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'fr'}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<script src="${runtimeFilename}"></script>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; max-width: 860px; margin-inline: auto; line-height: 1.5; }
  .scorm-nav { display: flex; justify-content: space-between; margin-top: 2rem; gap: 1rem; }
  .scorm-nav button, .scorm-complete button { padding: 0.6rem 1.2rem; border: 1px solid #333; background: #fff; cursor: pointer; border-radius: 4px; }
  .scorm-nav button:disabled { opacity: 0.4; cursor: default; }
  .scorm-progress { text-align: center; color: #555; font-size: 0.9rem; }
  .scorm-complete { text-align: center; margin-top: 2rem; }
  .scorm-status { text-align: center; margin-top: 0.5rem; font-size: 0.9rem; color: #2a7a2a; }
</style>
</head>
<body>
<h1>${title}</h1>
${description}
<div id="scorm-scenes">
${sections}
</div>
<div class="scorm-progress" id="scorm-progress"></div>
<div class="scorm-nav">
  <button id="scorm-prev" type="button">${labelPrev}</button>
  <button id="scorm-next" type="button">${labelNext}</button>
</div>
<div class="scorm-complete">
  <button id="scorm-complete-btn" type="button">${labelComplete}</button>
  <div class="scorm-status" id="scorm-status"></div>
</div>
<script>
(function () {
  var api = new Scorm12API({ autocommit: true, logLevel: 4 });
  window.API = api;
  api.LMSInitialize('');

  var scenes = document.querySelectorAll('.scorm-scene');
  var total = scenes.length;
  var current = 0;
  var prevBtn = document.getElementById('scorm-prev');
  var nextBtn = document.getElementById('scorm-next');
  var progress = document.getElementById('scorm-progress');
  var statusEl = document.getElementById('scorm-status');

  function render() {
    scenes.forEach(function (el, i) { el.style.display = i === current ? 'block' : 'none'; });
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === total - 1;
    progress.textContent = (current + 1) + ' / ' + total;
    api.LMSSetValue('cmi.core.lesson_location', String(current));
    api.LMSCommit('');
  }

  prevBtn.addEventListener('click', function () { if (current > 0) { current -= 1; render(); } });
  nextBtn.addEventListener('click', function () { if (current < total - 1) { current += 1; render(); } });

  document.getElementById('scorm-complete-btn').addEventListener('click', function () {
    api.LMSSetValue('cmi.core.lesson_status', 'completed');
    api.LMSSetValue('cmi.core.score.raw', '100');
    api.LMSCommit('');
    statusEl.textContent = ${JSON.stringify(labelDone)};
  });

  window.addEventListener('beforeunload', function () { api.LMSFinish(''); });

  render();
})();
</script>
</body>
</html>
`;
}

export async function buildScormPackage(stageId: string): Promise<ScormPackageResult> {
  const supabase = createServiceSupabaseClient();

  const { data: stageData, error: stageError } = await supabase
    .from('stages')
    .select('id, name, description, language')
    .eq('id', stageId)
    .single();
  if (stageError || !stageData) {
    throw new Error(`Cours introuvable pour l'export SCORM: ${stageError?.message ?? stageId}`);
  }
  const stage = stageData as StageRow;

  const { data: scenesData, error: scenesError } = await supabase
    .from('scenes')
    .select('id, type, title, order, content')
    .eq('stage_id', stageId)
    .order('order', { ascending: true });
  if (scenesError) {
    throw new Error(`Échec de lecture des scènes pour l'export SCORM: ${scenesError.message}`);
  }
  if (!scenesData || scenesData.length === 0) {
    throw new Error('Le cours ne contient aucune scène à exporter');
  }
  const scenes = scenesData as SceneRow[];

  const runtime = resolveScormRuntime();
  const indexHtml = buildIndexHtml(stage, scenes, runtime.filename);
  const manifest = buildScorm12Manifest({
    identifier: `com.qalem.export.${stageId}`,
    title: stage.name,
    launchUrl: 'index.html',
    resourceFiles: ['index.html', runtime.filename],
  });

  const zip = new JSZip();
  zip.file('imsmanifest.xml', manifest);
  zip.file('index.html', indexHtml);
  zip.file(runtime.filename, runtime.source);
  zip.file(
    'THIRD-PARTY-NOTICES.txt',
    'scorm-again — MIT License\nhttps://www.npmjs.com/package/scorm-again\n' +
      'Bundled unmodified as the SCORM 1.2 JavaScript runtime for this package.\n',
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  log.info(
    `Built SCORM 1.2 package for stage=${stageId}: ${scenes.length} scenes, ${buffer.length} bytes`,
  );

  return { zip: buffer, sceneCount: scenes.length };
}
