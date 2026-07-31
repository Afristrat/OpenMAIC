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

const ACCEPTED_EXTENSIONS = new Map([
  ['md', ['text/markdown', 'text/plain']],
  [
    'docx',
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ],
  ['pdf', ['application/pdf']],
]);

const SECTION_ALIASES = {
  outcome: ['résultat professionnel visé', 'target professional outcome', 'النتيجة المهنية المستهدفة'],
  audience: ['pour qui et dans quel contexte', 'audience and context', 'الفئة المستهدفة والسياق'],
  objective: ['objectif observable', 'observable objective', 'هدف قابل للملاحظة'],
  essential: ['contenu essentiel', 'essential content', 'المحتوى الأساسي'],
  practice: [
    'mise en pratique ou point de contrôle',
    'practice or checkpoint',
    'تطبيق عملي أو نقطة تحقق',
  ],
  evidence: ['preuve finale d’application', "preuve finale d'application", 'final application evidence', 'دليل التطبيق النهائي'],
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

function detectLanguage(text: string): SupportedCourseLanguage | undefined {
  const arabicCharacters = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latinCharacters = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (arabicCharacters >= 20 && arabicCharacters > latinCharacters / 2) return 'ar-MA';

  const frenchSignals = (text.match(/\b(le|la|les|des|une|pour|avec|dans|et|formation|objectif)\b/gi) ?? [])
    .length;
  const englishSignals = (text.match(/\b(the|and|with|for|course|objective|practice|final)\b/gi) ?? [])
    .length;
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
    issues.push(
      issue('CI-03', 'Règle CI-03 : Qalem n’identifie pas une langue prise en charge.'),
    );
  }

  const lines = text.split(/\r?\n/);
  const headings = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /^#{1,3}\s+\S/.test(line))
    .map(({ line, index }) => ({ level: line.match(/^#+/)?.[0].length ?? 0, text: line.replace(/^#+\s*/, ''), index }));
  const title = headings.find((heading) => heading.level === 1)?.text;
  if (!title) {
    issues.push(issue('CI-04', 'Règle CI-04 : ajoutez un titre principal unique au début du document.'));
  }

  const levelTwoHeadings = headings.filter((heading) => heading.level === 2);
  const topLevelSections = levelTwoHeadings.map((heading) => heading.text);
  if (!hasSection(topLevelSections, SECTION_ALIASES.outcome)) {
    issues.push(issue('CI-05', 'Règle CI-05 : indiquez le résultat professionnel visé.'));
  }
  if (!hasSection(topLevelSections, SECTION_ALIASES.audience)) {
    issues.push(issue('CI-06', 'Règle CI-06 : précisez le public, son niveau et son contexte de travail.'));
  }

  const chapters = levelTwoHeadings.filter((heading) =>
    /^(chapitre|chapter|الفصل)\b/i.test(normalizeHeading(heading.text)),
  );
  if (chapters.length === 0) {
    issues.push(issue('CI-07', 'Règle CI-07 : aucun chapitre n’a été trouvé.'));
  }

  for (const chapter of chapters) {
    const nextChapterIndex = chapters.find((candidate) => candidate.index > chapter.index)?.index ?? lines.length;
    const chapterHeadings = headings
      .filter((heading) => heading.level === 3 && heading.index > chapter.index && heading.index < nextChapterIndex)
      .map((heading) => heading.text);
    const chapterPath = chapter.text;
    if (!hasSection(chapterHeadings, SECTION_ALIASES.objective)) {
      issues.push(issue('CI-08', `Règle CI-08 : le chapitre « ${chapterPath} » n’a pas d’objectif observable.`, chapterPath));
    }
    if (!hasSection(chapterHeadings, SECTION_ALIASES.essential)) {
      issues.push(issue('CI-09', `Règle CI-09 : le chapitre « ${chapterPath} » ne contient pas le contenu essentiel.`, chapterPath));
    }
    if (!hasSection(chapterHeadings, SECTION_ALIASES.practice)) {
      issues.push(issue('CI-10', `Règle CI-10 : le chapitre « ${chapterPath} » n’a pas de mise en pratique.`, chapterPath));
    }
  }

  if (!hasSection(topLevelSections, SECTION_ALIASES.evidence)) {
    issues.push(issue('CI-11', 'Règle CI-11 : ajoutez une preuve finale d’application.'));
  }
  if (!input.rightsAttested || PII_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push(
      issue('CI-12', 'Règle CI-12 : retirez ou anonymisez les données personnelles de tiers et attestez vos droits.'),
    );
  }
  if (chapters.some((chapter) => headings.some((heading) => heading.level === 3 && heading.index < chapter.index))) {
    issues.push(issue('CI-13', 'Règle CI-13 : placez chaque sous-section sous le chapitre concerné.'));
  }

  if (issues.length > 0) return { canvasVersion: 'v1', status: 'rejected', ...(language ? { language } : {}), issues };
  return {
    canvasVersion: 'v1',
    status: 'conform',
    language,
    issues: [],
    outlinePreview: { title: title!, chapters: chapters.map((chapter) => chapter.text) },
  };
}
