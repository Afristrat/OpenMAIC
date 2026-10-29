/**
 * Archive de l'extension de capture servie par le site (public/downloads).
 *
 * L'archive est construite depuis le dépôt de l'extension (`pnpm zip`, navigateur Chrome) ; son
 * empreinte est contrôlée par un test, pour qu'une archive remplacée sans mise à jour de ces
 * valeurs fasse échouer la gate plutôt que d'afficher une empreinte fausse.
 */

export const EXTENSION_RELEASE = {
  version: '1.6.0',
  file: 'qalem-capture-1.6.0-chrome.zip',
  sizeBytes: 1_991_799,
  sha256: 'fee7476c1fa753d947e1b8f7d87aefa9e2375ad3b6d306413871a459cd0bc4ac',
  minChrome: 118,
} as const;

export const EXTENSION_DOWNLOAD_PATH = `/downloads/${EXTENSION_RELEASE.file}`;
