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
  sizeBytes: 1_991_478,
  sha256: '36ea6191c312c823e1d2ebb37b0bdda62e8a4551f8594d5c2f6d3bae34ee50aa',
  minChrome: 118,
} as const;

export const EXTENSION_DOWNLOAD_PATH = `/downloads/${EXTENSION_RELEASE.file}`;
