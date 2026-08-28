export type SupportedCourseLanguage = 'fr-FR' | 'ar-MA' | 'en-US';

export interface CanvasIssue {
  rule: string;
  path?: string;
  message: string;
}

export interface CanvasValidationResult {
  canvasVersion: 'v1';
  status: 'conform' | 'rejected';
  language?: SupportedCourseLanguage;
  issues: CanvasIssue[];
  outlinePreview?: { title: string; chapters: string[] };
}

export interface ParsedImportCanvasChapter {
  title: string;
  objective: string;
  essentialContent: string;
  practice: string;
}

export interface ParsedImportCanvas {
  title: string;
  outcome: string;
  audience: string;
  chapters: ParsedImportCanvasChapter[];
  finalEvidence: string;
}

const ACCEPTED_EXTENSIONS = new Map([
  ['md', ['text/markdown', 'text/plain']],
  ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['pdf', ['application/pdf']],
]);

const SECTION_ALIASES = {
  outcome: [
    'résultat professionnel visé',
    'target professional outcome',
    'النتيجة المهنية المستهدفة',
  ],
  audience: ['pour qui et dans quel contexte', 'audience and context', 'الفئة المستهدفة والسياق'],
  objective: ['objectif observable', 'observable objective', 'هدف قابل للملاحظة'],
  essential: ['contenu essentiel', 'essential content', 'المحتوى الأساسي'],
  practice: [
    'mise en pratique ou point de contrôle',
    'practice or checkpoint',
    'تطبيق عملي أو نقطة تحقق',
  ],
  evidence: [
    'preuve finale d’application',
    "preuve finale d'application",
    'final application evidence',
    'دليل التطبيق النهائي',
  ],
} as const;

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?\d[\s.-]?){8,15}\b/,
  /\b[A-Z]{1,2}\d{6,10}\b/i,
];

function normalizeHeading(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ');
}

function filenameExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

function hasSection(headings: string[], aliases: readonly string[]): boolean {
  const normalizedAliases = aliases.map(normalizeHeading);
  return headings.some((heading) => normalizedAliases.includes(normalizeHeading(heading)));
}

interface CanvasHeading {
  level: number;
  text: string;
  index: number;
}

function parseHeadings(lines: string[]): CanvasHeading[] {
  return lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /^#{1,3}\s+\S/.test(line))
    .map(({ line, index }) => ({
      level: line.match(/^#+/)?.[0].length ?? 0,
      text: line.replace(/^#+\s*/, ''),
      index,
    }));
}

function headingBody(lines: string[], headings: CanvasHeading[], heading?: CanvasHeading): string {
  if (!heading) return '';
  const end =
    headings.find(
      (candidate) => candidate.index > heading.index && candidate.level <= heading.level,
    )?.index ?? lines.length;
  return lines
    .slice(heading.index + 1, end)
    .join('\n')
    .trim();
}

function findHeading(
  headings: CanvasHeading[],
  level: number,
  aliases: readonly string[],
): CanvasHeading | undefined {
  const normalizedAliases = aliases.map(normalizeHeading);
  return headings.find(
    (heading) =>
      heading.level === level && normalizedAliases.includes(normalizeHeading(heading.text)),
  );
}

function parseCanvas(text: string): {
  lines: string[];
  headings: CanvasHeading[];
  titleHeadings: CanvasHeading[];
  outcomeHeading?: CanvasHeading;
  audienceHeading?: CanvasHeading;
  evidenceHeading?: CanvasHeading;
  chapters: Array<{
    heading: CanvasHeading;
    objectiveHeading?: CanvasHeading;
    essentialHeading?: CanvasHeading;
    practiceHeading?: CanvasHeading;
  }>;
} {
  const lines = text.split(/\r?\n/);
  const headings = parseHeadings(lines);
  const levelTwoHeadings = headings.filter((heading) => heading.level === 2);
  const chapterHeadings = levelTwoHeadings.filter((heading) =>
    /^(chapitre|chapter|الفصل)\b/i.test(normalizeHeading(heading.text)),
  );
  const chapters = chapterHeadings.map((heading) => {
    const end =
      chapterHeadings.find((candidate) => candidate.index > heading.index)?.index ?? lines.length;
    const children = headings.filter(
      (candidate) =>
        candidate.level === 3 && candidate.index > heading.index && candidate.index < end,
    );
    return {
      heading,
      objectiveHeading: findHeading(children, 3, SECTION_ALIASES.objective),
      essentialHeading: findHeading(children, 3, SECTION_ALIASES.essential),
      practiceHeading: findHeading(children, 3, SECTION_ALIASES.practice),
    };
  });

  return {
    lines,
    headings,
    titleHeadings: headings.filter((heading) => heading.level === 1),
    outcomeHeading: findHeading(levelTwoHeadings, 2, SECTION_ALIASES.outcome),
    audienceHeading: findHeading(levelTwoHeadings, 2, SECTION_ALIASES.audience),
    evidenceHeading: findHeading(levelTwoHeadings, 2, SECTION_ALIASES.evidence),
    chapters,
  };
}

export function parseImportCanvas(text: string): ParsedImportCanvas | null {
  const parsed = parseCanvas(text.trim());
  const title = parsed.titleHeadings[0]?.text.trim() ?? '';
  const outcome = headingBody(parsed.lines, parsed.headings, parsed.outcomeHeading);
  const audience = headingBody(parsed.lines, parsed.headings, parsed.audienceHeading);
  const finalEvidence = headingBody(parsed.lines, parsed.headings, parsed.evidenceHeading);
  const chapters = parsed.chapters.map((chapter) => ({
    title: chapter.heading.text.trim(),
    objective: headingBody(parsed.lines, parsed.headings, chapter.objectiveHeading),
    essentialContent: headingBody(parsed.lines, parsed.headings, chapter.essentialHeading),
    practice: headingBody(parsed.lines, parsed.headings, chapter.practiceHeading),
  }));
  if (
    parsed.titleHeadings.length !== 1 ||
    !title ||
    !outcome ||
    !audience ||
    !finalEvidence ||
    chapters.length === 0 ||
    chapters.some((chapter) => !chapter.objective || !chapter.essentialContent || !chapter.practice)
  ) {
    return null;
  }
  return { title, outcome, audience, chapters, finalEvidence };
}

function detectLanguage(text: string): SupportedCourseLanguage | undefined {
  const arabicCharacters = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latinCharacters = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (arabicCharacters >= 20 && arabicCharacters > latinCharacters / 2) return 'ar-MA';

  const frenchSignals = (
    text.match(/\b(le|la|les|des|une|pour|avec|dans|et|formation|objectif)\b/gi) ?? []
  ).length;
  const englishSignals = (
    text.match(/\b(the|and|with|for|course|objective|practice|final)\b/gi) ?? []
  ).length;
  if (latinCharacters < 20) return undefined;
  return frenchSignals >= englishSignals ? 'fr-FR' : 'en-US';
}

function issue(rule: string, message: string, path?: string): CanvasIssue {
  return { rule, message, ...(path ? { path } : {}) };
}

export function validateImportCanvas(input: {
  originalFilename: string;
  mimeType: string;
  text: string;
  rightsAttested: boolean;
}): CanvasValidationResult {
  const issues: CanvasIssue[] = [];
  const extension = filenameExtension(input.originalFilename);
  const allowedMimeTypes = ACCEPTED_EXTENSIONS.get(extension);
  if (!allowedMimeTypes || !allowedMimeTypes.includes(input.mimeType.toLowerCase())) {
    issues.push(
      issue('CI-01', 'Règle CI-01 : Qalem accepte un fichier Markdown, DOCX ou PDF texte.'),
    );
  }

  const text = input.text.trim();
  if (!text) {
    issues.push(
      issue('CI-02', 'Règle CI-02 : votre fichier ne contient pas de texte exploitable.'),
    );
  }

  const language = detectLanguage(text);
  if (!language) {
    issues.push(issue('CI-03', 'Règle CI-03 : Qalem n’identifie pas une langue prise en charge.'));
  }

  const parsed = parseCanvas(text);
  const title = parsed.titleHeadings[0]?.text;
  const firstChapterIndex = parsed.chapters[0]?.heading.index ?? Number.POSITIVE_INFINITY;
  if (
    parsed.titleHeadings.length !== 1 ||
    !title ||
    parsed.titleHeadings[0].index > firstChapterIndex
  ) {
    issues.push(
      issue('CI-04', 'Règle CI-04 : ajoutez un titre principal unique au début du document.'),
    );
  }

  if (!headingBody(parsed.lines, parsed.headings, parsed.outcomeHeading)) {
    issues.push(issue('CI-05', 'Règle CI-05 : indiquez le résultat professionnel visé.'));
  }
  if (!headingBody(parsed.lines, parsed.headings, parsed.audienceHeading)) {
    issues.push(
      issue('CI-06', 'Règle CI-06 : précisez le public, son niveau et son contexte de travail.'),
    );
  }

  if (parsed.chapters.length === 0) {
    issues.push(issue('CI-07', 'Règle CI-07 : aucun chapitre n’a été trouvé.'));
  }

  for (const chapter of parsed.chapters) {
    const chapterPath = chapter.heading.text;
    if (!headingBody(parsed.lines, parsed.headings, chapter.objectiveHeading)) {
      issues.push(
        issue(
          'CI-08',
          `Règle CI-08 : le chapitre « ${chapterPath} » n’a pas d’objectif observable.`,
          chapterPath,
        ),
      );
    }
    if (!headingBody(parsed.lines, parsed.headings, chapter.essentialHeading)) {
      issues.push(
        issue(
          'CI-09',
          `Règle CI-09 : le chapitre « ${chapterPath} » ne contient pas le contenu essentiel.`,
          chapterPath,
        ),
      );
    }
    if (!headingBody(parsed.lines, parsed.headings, chapter.practiceHeading)) {
      issues.push(
        issue(
          'CI-10',
          `Règle CI-10 : le chapitre « ${chapterPath} » n’a pas de mise en pratique.`,
          chapterPath,
        ),
      );
    }
  }

  if (!headingBody(parsed.lines, parsed.headings, parsed.evidenceHeading)) {
    issues.push(issue('CI-11', 'Règle CI-11 : ajoutez une preuve finale d’application.'));
  }
  if (!input.rightsAttested || PII_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push(
      issue(
        'CI-12',
        'Règle CI-12 : retirez ou anonymisez les données personnelles de tiers et attestez vos droits.',
      ),
    );
  }
  const requiredSubsectionAliases = [
    ...SECTION_ALIASES.objective,
    ...SECTION_ALIASES.essential,
    ...SECTION_ALIASES.practice,
  ];
  const requiredSubsectionsOutsideChapter = parsed.headings.some((heading) => {
    if (heading.level !== 3 || !hasSection([heading.text], requiredSubsectionAliases)) return false;
    return !parsed.chapters.some((chapter, index) => {
      const end = parsed.chapters[index + 1]?.heading.index ?? parsed.lines.length;
      return heading.index > chapter.heading.index && heading.index < end;
    });
  });
  if (requiredSubsectionsOutsideChapter) {
    issues.push(
      issue('CI-13', 'Règle CI-13 : placez chaque sous-section sous le chapitre concerné.'),
    );
  }

  if (issues.length > 0)
    return { canvasVersion: 'v1', status: 'rejected', ...(language ? { language } : {}), issues };
  return {
    canvasVersion: 'v1',
    status: 'conform',
    language,
    issues: [],
    outlinePreview: {
      title: title!,
      chapters: parsed.chapters.map((chapter) => chapter.heading.text),
    },
  };
}
