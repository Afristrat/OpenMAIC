import { z } from 'zod';

/**
 * Lecture du référentiel commun (OpenSALT, format CASE 1.0) : métiers ISCO-08 / ESCO et compétences.
 * La plateforme publie un document par sous-grand groupe ISCO ; le type d'élément n'est pas exporté,
 * l'URI ESCO portée par `notes` est la seule clé stable d'un document à l'autre.
 */

const API_PATH = '/ims/case/v1p0';
const REQUEST_TIMEOUT_MS = 60_000;
const ESSENTIAL = 'Compétence essentielle';
const OPTIONAL = 'Compétence optionnelle';

const nodeRef = z.object({ title: z.string(), identifier: z.string(), uri: z.string() });

const documentSchema = z.object({
  identifier: z.string(),
  uri: z.string(),
  title: z.string(),
  version: z.string().optional(),
});

const itemSchema = z.object({
  identifier: z.string(),
  uri: z.string(),
  fullStatement: z.string(),
  humanCodingScheme: z.string().optional(),
  language: z.string().optional(),
  notes: z.string().optional(),
});

const associationSchema = z.object({
  identifier: z.string(),
  uri: z.string(),
  associationType: z.string(),
  originNodeURI: nodeRef,
  destinationNodeURI: nodeRef,
  CFAssociationGroupingURI: nodeRef.optional(),
});

const packageSchema = z.object({
  CFDocument: documentSchema,
  CFItems: z.array(itemSchema),
  CFAssociations: z.array(associationSchema),
});

export type CaseDocument = z.infer<typeof documentSchema>;
export type CasePackage = z.infer<typeof packageSchema>;
type CaseItem = z.infer<typeof itemSchema>;

export type Titles = { fr: string; ar: string | null; en: string | null };

export type Competence = {
  /** URI ESCO si l'élément en porte une, sinon l'URI CASE de l'élément (référentiel d'organisme). */
  competenceUri: string;
  escoUri: string | null;
  title: string;
  titles: Titles;
};

export type OccupationCompetencies = {
  occupation: {
    title: string;
    escoUri: string;
    /** Groupe de base ISCO-08, quatre chiffres. */
    iscoCode: string | null;
    /** `<identifiant du document>@<version>`, tel que l'attend la passerelle (100 caractères au plus). */
    referentielVersion: string;
  };
  essential: Competence[];
  optional: Competence[];
};

const notesSchema = z
  .object({
    uri: z.string().optional(),
    isco: z.string().nullish(),
    ar: z.string().nullish(),
    en: z.string().nullish(),
  })
  .passthrough();

function readNotes(item: CaseItem): z.infer<typeof notesSchema> {
  if (!item.notes) return {};
  try {
    const parsed = notesSchema.safeParse(JSON.parse(item.notes));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function toCompetence(item: CaseItem): Competence {
  const notes = readNotes(item);
  const escoUri = notes.uri?.includes('/esco/skill/') ? notes.uri : null;
  return {
    competenceUri: escoUri ?? item.uri,
    escoUri,
    title: item.fullStatement,
    titles: { fr: item.fullStatement, ar: notes.ar ?? null, en: notes.en ?? null },
  };
}

/** Compétences essentielles et optionnelles d'un métier, ou null si le document ne le contient pas. */
export function competenciesOfOccupation(
  source: CasePackage,
  occupationEscoUri: string,
): OccupationCompetencies | null {
  const occupation = source.CFItems.find((item) => readNotes(item).uri === occupationEscoUri);
  if (!occupation) return null;
  const byIdentifier = new Map(source.CFItems.map((item) => [item.identifier, item]));
  const essential: Competence[] = [];
  const optional: Competence[] = [];
  for (const link of source.CFAssociations) {
    if (link.associationType !== 'isRelatedTo') continue;
    if (link.originNodeURI.identifier !== occupation.identifier) continue;
    const target = byIdentifier.get(link.destinationNodeURI.identifier);
    if (!target) continue;
    const grouping = link.CFAssociationGroupingURI?.title;
    if (grouping === ESSENTIAL) essential.push(toCompetence(target));
    else if (grouping === OPTIONAL) optional.push(toCompetence(target));
  }
  const iscoCode = readNotes(occupation).isco ?? null;
  return {
    occupation: {
      title: occupation.fullStatement,
      escoUri: occupationEscoUri,
      iscoCode: iscoCode && /^\d{1,4}$/.test(iscoCode) ? iscoCode : null,
      referentielVersion: `${source.CFDocument.identifier}@${source.CFDocument.version ?? ''}`,
    },
    essential,
    optional,
  };
}

async function readJson(baseUrl: string, path: string): Promise<unknown> {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') throw new Error('Le référentiel doit être lu en https');
  const response = await fetch(`${base.origin}${API_PATH}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(`Lecture du référentiel refusée : HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchCaseDocuments(baseUrl: string): Promise<CaseDocument[]> {
  const parsed = z
    .object({ CFDocuments: z.array(documentSchema) })
    .safeParse(await readJson(baseUrl, '/CFDocuments'));
  if (!parsed.success) throw new Error('Liste de documents du référentiel invalide');
  return parsed.data.CFDocuments;
}

export async function fetchCasePackage(baseUrl: string, documentId: string): Promise<CasePackage> {
  if (!/^[0-9a-f-]{36}$|^[A-Za-z0-9_-]{1,64}$/.test(documentId)) {
    throw new Error('Identifiant de document invalide');
  }
  const parsed = packageSchema.safeParse(
    await readJson(baseUrl, `/CFPackages/${encodeURIComponent(documentId)}`),
  );
  if (!parsed.success) throw new Error('Paquet CASE invalide');
  return parsed.data;
}
