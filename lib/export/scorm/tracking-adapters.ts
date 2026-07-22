import {
  buildScorm12Manifest,
  buildScorm2004Manifest,
  escapeXml,
  type ScormManifestOptions,
} from './imsmanifest';

export type LearningPackageFormat = 'scorm12' | 'scorm2004' | 'cmi5';

export interface TrackingAdapter {
  format: LearningPackageFormat;
  archiveExtension: string;
  manifestFilename: 'imsmanifest.xml' | 'cmi5.xml';
  buildManifest(input: ScormManifestOptions & { description: string; language: string }): string;
  buildTrackingScript(): string;
}

const STANDARD_API_LOOKUP = `
function findApi(name) {
  var current = window;
  for (var depth = 0; depth < 20; depth += 1) {
    try { if (current[name]) return current[name]; } catch (_) { /* cross-origin parent */ }
    if (!current.parent || current.parent === current) break;
    current = current.parent;
  }
  try {
    if (window.opener) return window.opener[name] || null;
  } catch (_) { /* cross-origin opener */ }
  return null;
}
`;

function buildScorm12TrackingScript(): string {
  return `
${STANDARD_API_LOOKUP}
var api = findApi('API');
if (!api) throw new Error('API SCORM 1.2 introuvable dans le LMS.');
if (api.LMSInitialize('') !== 'true') throw new Error('Initialisation SCORM 1.2 refusée par le LMS.');
window.qalemTracking = {
  location: function (value) { api.LMSSetValue('cmi.core.lesson_location', String(value)); api.LMSCommit(''); },
  complete: function () { api.LMSSetValue('cmi.core.lesson_status', 'completed'); api.LMSSetValue('cmi.core.score.raw', '100'); api.LMSCommit(''); },
  terminate: function () { api.LMSFinish(''); }
};
`;
}

function buildScorm2004TrackingScript(): string {
  return `
${STANDARD_API_LOOKUP}
var api = findApi('API_1484_11');
if (!api) throw new Error('API SCORM 2004 introuvable dans le LMS.');
if (api.Initialize('') !== 'true') throw new Error('Initialisation SCORM 2004 refusée par le LMS.');
window.qalemTracking = {
  location: function (value) { api.SetValue('cmi.location', String(value)); api.Commit(''); },
  complete: function () { api.SetValue('cmi.completion_status', 'completed'); api.SetValue('cmi.success_status', 'passed'); api.Commit(''); },
  terminate: function () { api.Terminate(''); }
};
`;
}

function buildCmi5TrackingScript(): string {
  return `
(function () {
  var params = new URLSearchParams(window.location.search);
  var endpoint = params.get('endpoint');
  var fetchUrl = params.get('fetch');
  var actor = params.get('actor');
  var registration = params.get('registration');
  var activityId = params.get('activityId');
  var terminated = false;
  var state = null;
  var authToken = null;

  function required(value, name) {
    if (!value) throw new Error('Paramètre de lancement cmi5 manquant : ' + name);
    return value;
  }
  function endpointUrl(path, query) {
    var url = new URL(path, required(endpoint, 'endpoint'));
    Object.keys(query).forEach(function (key) { url.searchParams.set(key, query[key]); });
    return url.toString();
  }
  function headers() {
    return { 'Authorization': authToken, 'Content-Type': 'application/json', 'X-Experience-API-Version': '1.0.3' };
  }
  function statementId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  function context() {
    return state.contextTemplate;
  }
  function send(verb, result, keepalive) {
    var payload = {
      id: statementId(),
      actor: JSON.parse(required(actor, 'actor')),
      verb: { id: verb },
      object: { id: required(activityId, 'activityId') },
      context: context(),
      timestamp: new Date().toISOString()
    };
    if (result) payload.result = result;
    return window.fetch(endpointUrl('statements'), { method: 'POST', headers: headers(), body: JSON.stringify(payload), keepalive: Boolean(keepalive) });
  }
  async function initialize() {
    required(fetchUrl, 'fetch');
    required(registration, 'registration');
    var tokenResponse = await window.fetch(fetchUrl, { method: 'POST' });
    if (!tokenResponse.ok) throw new Error('Jeton cmi5 refusé par le LMS.');
    var tokenPayload = await tokenResponse.json();
    authToken = tokenPayload['auth-token'];
    if (!authToken) throw new Error('Jeton cmi5 absent de la réponse LMS.');
    var launchDataResponse = await window.fetch(endpointUrl('activities/state', {
      activityId: required(activityId, 'activityId'),
      agent: required(actor, 'actor'),
      registration: registration,
      stateId: 'LMS.LaunchData'
    }), { headers: headers() });
    if (!launchDataResponse.ok) throw new Error('Données de lancement cmi5 indisponibles.');
    state = await launchDataResponse.json();
    if (!state.contextTemplate || !state.launchMode) throw new Error('Données de lancement cmi5 invalides.');
    await send('http://adlnet.gov/expapi/verbs/initialized');
  }

  var ready = initialize();
  window.qalemTracking = {
    location: function () { return ready; },
    complete: function () {
      return ready.then(function () {
        if (state.launchMode !== 'Normal') return;
        return send('http://adlnet.gov/expapi/verbs/completed', { completion: true, extensions: { 'https://w3id.org/xapi/cmi5/result/extensions/progress': 1 } });
      });
    },
    terminate: function () {
      if (terminated) return Promise.resolve();
      terminated = true;
      return ready.then(function () { return send('http://adlnet.gov/expapi/verbs/terminated', null, true); });
    }
  };
}());
`;
}

function buildCmi5Manifest(
  options: ScormManifestOptions & { description: string; language: string },
): string {
  const courseId = `https://qalem.ma/exports/courses/${encodeURIComponent(options.identifier)}`;
  const auId = `${courseId}/au/1`;
  const language = options.language || 'fr-FR';
  const description = options.description || options.title;

  return `<?xml version="1.0" encoding="UTF-8"?>
<course xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd" id="${escapeXml(courseId)}">
  <title><langstring lang="${escapeXml(language)}">${escapeXml(options.title)}</langstring></title>
  <description><langstring lang="${escapeXml(language)}">${escapeXml(description)}</langstring></description>
  <au id="${escapeXml(auId)}" launchMethod="AnyWindow" moveOn="CompletedOrPassed">
    <title><langstring lang="${escapeXml(language)}">${escapeXml(options.title)}</langstring></title>
    <description><langstring lang="${escapeXml(language)}">${escapeXml(description)}</langstring></description>
    <url>${escapeXml(options.launchUrl)}</url>
  </au>
</course>
`;
}

export const trackingAdapters: Record<LearningPackageFormat, TrackingAdapter> = {
  scorm12: {
    format: 'scorm12',
    archiveExtension: 'scorm12.zip',
    manifestFilename: 'imsmanifest.xml',
    buildManifest: buildScorm12Manifest,
    buildTrackingScript: buildScorm12TrackingScript,
  },
  scorm2004: {
    format: 'scorm2004',
    archiveExtension: 'scorm2004.zip',
    manifestFilename: 'imsmanifest.xml',
    buildManifest: buildScorm2004Manifest,
    buildTrackingScript: buildScorm2004TrackingScript,
  },
  cmi5: {
    format: 'cmi5',
    archiveExtension: 'cmi5.zip',
    manifestFilename: 'cmi5.xml',
    buildManifest: buildCmi5Manifest,
    buildTrackingScript: buildCmi5TrackingScript,
  },
};

export function isLearningPackageFormat(value: string): value is LearningPackageFormat {
  return value === 'scorm12' || value === 'scorm2004' || value === 'cmi5';
}
