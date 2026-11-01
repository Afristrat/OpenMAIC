import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  competenciesOfOccupation,
  fetchCaseDocuments,
  fetchCasePackage,
  type CasePackage,
} from '@/lib/referentiel/case-client';

const DOC = 'doc-1';
const ref = (kind: string, identifier: string, title: string) => ({
  title,
  identifier,
  uri: `https://referentiel.test/ims/case/v1p0/${kind}/${identifier}`,
});
const item = (identifier: string, title: string, code: string, notes: object) => ({
  identifier,
  uri: `https://referentiel.test/ims/case/v1p0/CFItems/${identifier}`,
  fullStatement: title,
  humanCodingScheme: code,
  language: 'fr',
  notes: JSON.stringify(notes),
});
const relation = (id: string, origin: string, destination: string, grouping: string) => ({
  identifier: id,
  uri: `https://referentiel.test/ims/case/v1p0/CFAssociations/${id}`,
  associationType: 'isRelatedTo',
  originNodeURI: ref('CFItems', origin, origin),
  destinationNodeURI: ref('CFItems', destination, destination),
  CFAssociationGroupingURI: ref('CFAssociationGroupings', grouping, grouping),
});

const pkg: CasePackage = {
  CFDocument: {
    identifier: DOC,
    uri: `https://referentiel.test/ims/case/v1p0/CFDocuments/${DOC}`,
    title: 'ISCO 25 : TIC',
    version: '2026-10-31',
  },
  CFItems: [
    item('g', 'Concepteurs de sites', 'ISCO 2513', {
      uri: 'http://data.europa.eu/esco/isco/C2513',
      ar: null,
      en: 'Web developers',
    }),
    item('o', 'développeur web', 'ESCO 2513.1', {
      uri: 'http://data.europa.eu/esco/occupation/occ-1',
      isco: '2513',
      ar: 'مطور',
      en: 'web developer',
    }),
    item('s1', 'programmation informatique', '', {
      uri: 'http://data.europa.eu/esco/skill/skill-1',
      ar: 'برمجة',
      en: 'computer programming',
    }),
    item('s2', 'gérer un projet', '', {
      uri: 'http://data.europa.eu/esco/skill/skill-2',
      ar: null,
      en: 'manage a project',
    }),
  ],
  CFAssociations: [
    relation('a1', 'o', 's1', 'Compétence essentielle'),
    relation('a2', 'o', 's2', 'Compétence optionnelle'),
    {
      identifier: 'a3',
      uri: 'https://referentiel.test/ims/case/v1p0/CFAssociations/a3',
      associationType: 'isChildOf',
      originNodeURI: ref('CFItems', 'o', 'o'),
      destinationNodeURI: ref('CFItems', 'g', 'g'),
    },
  ],
};

describe('competenciesOfOccupation', () => {
  it('returns essential and optional skills with their stable ESCO URI, ISCO base group and document version', () => {
    const result = competenciesOfOccupation(pkg, 'http://data.europa.eu/esco/occupation/occ-1');
    expect(result).not.toBeNull();
    expect(result?.occupation).toMatchObject({
      title: 'développeur web',
      iscoCode: '2513',
      referentielVersion: `${DOC}@2026-10-31`,
    });
    expect(result?.essential.map((s) => s.escoUri)).toEqual([
      'http://data.europa.eu/esco/skill/skill-1',
    ]);
    expect(result?.optional.map((s) => s.title)).toEqual(['gérer un projet']);
    expect(result?.essential[0].titles).toEqual({
      fr: 'programmation informatique',
      ar: 'برمجة',
      en: 'computer programming',
    });
  });

  it('returns null for an occupation absent from the document and ignores hierarchy links', () => {
    expect(
      competenciesOfOccupation(pkg, 'http://data.europa.eu/esco/occupation/inconnu'),
    ).toBeNull();
  });

  it('keeps a skill without ESCO URI addressable by its CFItem URI', () => {
    const local: CasePackage = {
      ...pkg,
      CFItems: [
        ...pkg.CFItems,
        item('s3', 'compétence maison', '', { note: 'référentiel d’organisme' }),
      ],
      CFAssociations: [...pkg.CFAssociations, relation('a4', 'o', 's3', 'Compétence essentielle')],
    };
    const result = competenciesOfOccupation(local, 'http://data.europa.eu/esco/occupation/occ-1');
    expect(result?.essential.at(-1)?.competenceUri).toBe(
      'https://referentiel.test/ims/case/v1p0/CFItems/s3',
    );
  });
});

describe('CASE reading over HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists documents and reads a package from the configured base, refusing anything but https', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify(url.includes('CFPackages') ? pkg : { CFDocuments: [pkg.CFDocument] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const docs = await fetchCaseDocuments('https://referentiel.test');
    expect(docs.map((d) => d.identifier)).toEqual([DOC]);
    const read = await fetchCasePackage('https://referentiel.test', DOC);
    expect(read.CFItems).toHaveLength(4);
    expect(calls).toEqual([
      'https://referentiel.test/ims/case/v1p0/CFDocuments',
      `https://referentiel.test/ims/case/v1p0/CFPackages/${DOC}`,
    ]);
    await expect(fetchCaseDocuments('http://referentiel.test')).rejects.toThrow('https');
  });

  it('fails loudly on a non-200 answer or an invalid package', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    await expect(fetchCasePackage('https://referentiel.test', DOC)).rejects.toThrow('500');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"CFItems":1}', { status: 200 })),
    );
    await expect(fetchCasePackage('https://referentiel.test', DOC)).rejects.toThrow('invalide');
  });
});
