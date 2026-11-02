/**
 * Archive de l'extension de capture servie par le site (public/downloads).
 *
 * L'archive est construite depuis le dépôt de l'extension (`pnpm zip`, navigateur Chrome) ; son
 * empreinte est contrôlée par un test, pour qu'une archive remplacée sans mise à jour de ces
 * valeurs fasse échouer la gate plutôt que d'afficher une empreinte fausse.
 */

export const EXTENSION_RELEASE = {
  version: '1.6.1',
  file: 'qalem-capture-1.6.1-chrome.zip',
  sizeBytes: 1_995_601,
  sha256: '59d2526b2a5146c159899ad39dd7da7ce6520a7b0c1383ff7da20e8f5e60fb21',
  minChrome: 118,
} as const;

export const EXTENSION_DOWNLOAD_PATH = `/downloads/${EXTENSION_RELEASE.file}`;
