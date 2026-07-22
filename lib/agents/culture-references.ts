/**
 * Versioned cultural-reference registry. Names stay intentionally empty until
 * S2-011 records Amine's explicit validation; casting may read the reference
 * identity but must never use it to alter an avatar or a name beforehand.
 */
export const CULTURE_REFERENCE_VERSION = '2026-07-22';

export interface CultureReference {
  code: string;
  status: 'pending-human-approval';
}

export const CULTURE_REFERENCES: readonly CultureReference[] = [
  { code: 'ma-fr', status: 'pending-human-approval' },
  { code: 'ma-ar', status: 'pending-human-approval' },
  { code: 'en', status: 'pending-human-approval' },
];

export function resolveCultureReference(culture: string): CultureReference {
  return (
    CULTURE_REFERENCES.find((reference) => reference.code === culture) ??
    CULTURE_REFERENCES[0]
  );
}
