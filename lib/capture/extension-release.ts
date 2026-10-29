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
  sizeBytes: 1_995_369,
  sha256: 'a9fc918dea8b5337688744a1ed96b48cfb75aadcb77e06c0d9d4da49ef86ae22',
  minChrome: 118,
} as const;

export const EXTENSION_DOWNLOAD_PATH = `/downloads/${EXTENSION_RELEASE.file}`;
