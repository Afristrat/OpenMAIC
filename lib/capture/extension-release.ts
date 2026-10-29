/**
 * Archive de l'extension de capture servie par le site (public/downloads).
 *
 * L'archive est construite depuis le dépôt de l'extension (`pnpm zip`, navigateur Chrome) ; son
 * empreinte est contrôlée par un test, pour qu'une archive remplacée sans mise à jour de ces
 * valeurs fasse échouer la gate plutôt que d'afficher une empreinte fausse.
 */

export const EXTENSION_RELEASE = {
  version: '1.5.0',
  file: 'qalem-capture-1.5.0-chrome.zip',
  sizeBytes: 1_883_780,
  sha256: 'f4e072e921d3d1988dd72facefd65c44c8154d2188710e4493b6d6e29c75339b',
  minChrome: 118,
} as const;

export const EXTENSION_DOWNLOAD_PATH = `/downloads/${EXTENSION_RELEASE.file}`;
