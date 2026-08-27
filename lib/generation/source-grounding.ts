import type { PdfSourceContent, SceneOutline } from '@/lib/types/generation';

const MAX_PASSAGE_LENGTH = 900;
const MAX_PASSAGES_PER_SCENE = 4;

const STOP_WORDS = new Set([
  'avec',
  'dans',
  'des',
  'pour',
  'sur',
  'une',
  'the',
  'and',
  'for',
  'from',
  'that',
  'this',
  'with',
  'إلى',
  'التي',
  'الذي',
  'على',
  'في',
  'من',
]);

export interface SourceDocument {
  id: string;
  version: string;
  title: string;
  text: string;
}

export interface SourcePassage {
  id: string;
  sourceId: string;
  sourceVersion: string;
  sourceTitle: string;
  text: string;
  start: number;
  end: number;
}

export interface SourceGroundingIssue {
  type: 'unsupported' | 'contradictory';
  message: string;
  passageIds: string[];
}

export interface SceneSourceGrounding {
  schemaVersion: 1;
  status: 'grounded' | 'unsupported' | 'contradictory';
  passages: SourcePassage[];
  issues: SourceGroundingIssue[];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function uploadedSourceDocument(source: PdfSourceContent): SourceDocument {
  const title = source.name?.trim() || 'Document fourni par l’auteur';
  return {
    id: `uploaded-${stableHash(title.toLocaleLowerCase())}`,
    version: `v1-${stableHash(source.text)}`,
    title,
    text: source.text,
  };
}

function normalizedTokens(value: string): Set<string> {
  const tokens =
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return new Set(tokens.filter((token) => !STOP_WORDS.has(token)));
}

function chunkDocument(source: SourceDocument): SourcePassage[] {
  const normalized = source.text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const passages: SourcePassage[] = [];
  let cursor = 0;
  for (let start = 0; start < normalized.length; start += MAX_PASSAGE_LENGTH) {
    let end = Math.min(start + MAX_PASSAGE_LENGTH, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('\n', end);
      if (boundary > start + MAX_PASSAGE_LENGTH / 2) end = boundary;
    }
    const text = normalized.slice(start, end).trim();
    if (text) {
      const passageIndex = passages.length + 1;
      passages.push({
        id: `${source.id}:${source.version}:p${passageIndex}`,
        sourceId: source.id,
        sourceVersion: source.version,
        sourceTitle: source.title,
        text,
        start: cursor + start,
        end: cursor + end,
      });
    }
    start = end - MAX_PASSAGE_LENGTH;
  }
  return passages;
}

function passageScore(passage: SourcePassage, outlineTokens: ReadonlySet<string>): number {
  const tokens = normalizedTokens(passage.text);
  let overlap = 0;
  for (const token of outlineTokens) {
    if (tokens.has(token)) overlap += 1;
  }
  return overlap;
}

function numericClaims(value: string): Set<string> {
  return new Set(value.match(/\b\d+(?:[.,]\d+)?\s*(?:%|°[CF]|[A-Za-z]{1,8})?\b/gu) ?? []);
}

function hasNegativePolarity(value: string): boolean {
  return /\b(?:ne|n['’]|not|never|without|aucun|interdit)\b|(?:لا|ليس|بدون)/iu.test(value);
}

function findContradictions(passages: SourcePassage[]): SourceGroundingIssue[] {
  for (let leftIndex = 0; leftIndex < passages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < passages.length; rightIndex += 1) {
      const left = passages[leftIndex];
      const right = passages[rightIndex];
      if (left.sourceId === right.sourceId && left.sourceVersion === right.sourceVersion) continue;

      const leftTokens = normalizedTokens(left.text);
      const rightTokens = normalizedTokens(right.text);
      const shared = [...leftTokens].filter((token) => rightTokens.has(token));
      if (shared.length < 3) continue;

      const leftNumbers = numericClaims(left.text);
      const rightNumbers = numericClaims(right.text);
      const numbersConflict =
        leftNumbers.size > 0 &&
        rightNumbers.size > 0 &&
        [...leftNumbers].every((claim) => !rightNumbers.has(claim));
      const polarityConflict = hasNegativePolarity(left.text) !== hasNegativePolarity(right.text);
      if (!numbersConflict && !polarityConflict) continue;

      return [
        {
          type: 'contradictory',
          message:
            'Les passages sélectionnés contiennent des affirmations incompatibles ; la scène doit signaler le désaccord au lieu de choisir silencieusement une version.',
          passageIds: [left.id, right.id],
        },
      ];
    }
  }
  return [];
}

export function buildSceneSourceGrounding(
  outline: SceneOutline,
  sources: readonly SourceDocument[],
): SceneSourceGrounding | undefined {
  if (sources.length === 0) return undefined;

  const outlineTokens = normalizedTokens(
    [outline.title, outline.description, ...(outline.keyPoints ?? [])].join(' '),
  );
  const ranked = sources
    .flatMap(chunkDocument)
    .map((passage) => ({ passage, score: passageScore(passage, outlineTokens) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.passage.id.localeCompare(right.passage.id))
    .slice(0, MAX_PASSAGES_PER_SCENE)
    .map(({ passage }) => passage);

  if (ranked.length === 0) {
    return {
      schemaVersion: 1,
      status: 'unsupported',
      passages: [],
      issues: [
        {
          type: 'unsupported',
          message:
            'Aucun passage pertinent n’a été trouvé pour cette scène ; toute affirmation présentée comme issue des documents doit être signalée comme non étayée.',
          passageIds: [],
        },
      ],
    };
  }

  const contradictions = findContradictions(ranked);
  return {
    schemaVersion: 1,
    status: contradictions.length > 0 ? 'contradictory' : 'grounded',
    passages: ranked,
    issues: contradictions,
  };
}

export function formatSourceGroundingForPrompt(
  grounding: SceneSourceGrounding | undefined,
): string {
  if (!grounding) return '';
  const passages = grounding.passages
    .map(
      (passage) =>
        `[${passage.id}] source=${passage.sourceId} version=${passage.sourceVersion}\n${passage.text}`,
    )
    .join('\n\n');
  const issues = grounding.issues.map((issue) => `- ${issue.message}`).join('\n');
  return [
    '## AUTHORITATIVE SOURCE GROUNDING',
    `Grounding status: ${grounding.status}.`,
    passages || 'No relevant source passage is available for this scene.',
    issues ? `Issues that MUST be stated plainly in the learner-facing content:\n${issues}` : '',
    'Use only these passages for claims attributed to the supplied documents.',
    'Keep the passage identifiers available in the narration or visible content when citing a sourced claim.',
    'If a requested claim is absent or contradicted, say so explicitly; never fill the gap from assumption or unrelated world knowledge.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
