import { describe, expect, it } from 'vitest';
import type { CasePackage } from '@/lib/referentiel/case-client';
import { mirrorRows, normalizeSearch } from '@/lib/referentiel/mirror';

const base = 'https://referentiel.test/ims/case/v1p0';
const ref = (kind: string, identifier: string) => ({
  title: identifier,
  identifier,
  uri: `${base}/${kind}/${identifier}`,
});
const item = (identifier: string, title: string, notes: object) => ({
  identifier,
  uri: `${base}/CFItems/${identifier}`,
  fullStatement: title,
  language: 'fr',
  notes: JSON.stringify(notes),
});
const relation = (id: string, origin: string, destination: string, grouping: string) => ({
  identifier: id,
  uri: `${base}/CFAssociations/${id}`,
  associationType: 'isRelatedTo',
  originNodeURI: ref('CFItems', origin),
  destinationNodeURI: ref('CFItems', destination),
  CFAssociationGroupingURI: ref('CFAssociationGroupings', grouping) && {
    ...ref('CFAssociationGroupings', grouping),
    title: grouping,
  },
});

const OCCUPATION = 'http://data.europa.eu/esco/occupation/occ-1';
const SKILL_A = 'http://data.europa.eu/esco/skill/a';
const SKILL_B = 'http://data.europa.eu/esco/skill/b';

const pkg: CasePackage = {
  CFDocument: {
    identifier: 'doc-1',
    uri: `${base}/CFDocuments/doc-1`,
    title: 'ISCO 25',
    version: 'v1',
  },
  CFItems: [
    item('group', 'Concepteurs', { uri: 'http://data.europa.eu/esco/isco/C2513' }),
    item('occ', 'Développeur web', {
      uri: OCCUPATION,
      isco: '2513',
      ar: 'مطور',
      en: 'Web developer',
    }),
    item('a', 'Programmation', { uri: SKILL_A, ar: 'برمجة', en: 'Programming' }),
    item('b', 'Gérer un projet', { uri: SKILL_B, en: 'Manage a project' }),
  ],
  CFAssociations: [
    relation('r1', 'occ', 'a', 'Compétence essentielle'),
    relation('r2', 'occ', 'b', 'Compétence optionnelle'),
  ],
};

describe('normalizeSearch', () => {
  it('lowercases, strips accents and collapses spaces, and keeps Arabic letters', () => {
    expect(normalizeSearch('  Développeur   WEB  Éthique ')).toBe('developpeur web ethique');
    expect(normalizeSearch('مطور ويب')).toBe('مطور ويب');
  });
});

describe('mirrorRows', () => {
  it('turns a CASE package into occupation rows, skill rows and the version contract', () => {
    const { occupations, skills } = mirrorRows(pkg);

    expect(occupations).toHaveLength(1);
    expect(occupations[0]).toMatchObject({
      uri: OCCUPATION,
      title_fr: 'Développeur web',
      title_ar: 'مطور',
      title_en: 'Web developer',
      isco_code: '2513',
      document_id: 'doc-1',
      referentiel_version: 'doc-1@v1',
      essential_uris: [SKILL_A],
      optional_uris: [SKILL_B],
    });
    expect(occupations[0]?.search_text).toContain('developpeur web');
    expect(skills.map((skill) => skill.uri).sort()).toEqual([SKILL_A, SKILL_B]);
    expect(skills.find((skill) => skill.uri === SKILL_B)).toMatchObject({
      title_fr: 'Gérer un projet',
      title_ar: null,
      title_en: 'Manage a project',
    });
  });

  it('skips the ISCO group items, which are not occupations', () => {
    expect(mirrorRows({ ...pkg, CFAssociations: [] }).occupations.map((row) => row.uri)).toEqual([
      OCCUPATION,
    ]);
  });
});
