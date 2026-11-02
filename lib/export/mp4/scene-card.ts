const SKIPPED_KEYS = new Set([
  'id',
  'src',
  'url',
  'audioId',
  'audioUrl',
  'html',
  'background',
  'backgroundColor',
  'color',
  'defaultColor',
  'fill',
  'fontColor',
  'outline',
  'shadow',
  'stroke',
  'theme',
  'themeColors',
  // Géométrie, police et type de graphique : du réglage, jamais du texte à lire.
  'path',
  'viewBox',
  'fontName',
  'defaultFontName',
  'chartType',
  'textType',
]);

const TECHNICAL_VALUE =
  /^(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\(|(?:url|linear-gradient|radial-gradient)\()/i;

function collectStrings(value: unknown, key: string | null, output: string[]): void {
  if (output.join(' ').length >= 1400) return;
  if (typeof value === 'string') {
    const text = value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text && !text.startsWith('http') && key !== 'type' && !TECHNICAL_VALUE.test(text)) {
      output.push(text);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, key, output));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      if (!SKIPPED_KEYS.has(childKey)) collectStrings(childValue, childKey, output);
    });
  }
}

export function sceneReadableText(content: unknown): string {
  const strings: string[] = [];
  collectStrings(content, null, strings);
  return [...new Set(strings)].join(' ').slice(0, 1400);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function wrapText(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxCharacters) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length && lines.join(' ').length < value.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]$/, '')}…`;
  }
  return lines;
}

type CardLine = { text: string; kind: 'question' | 'option' | 'text' | 'more' };

const MAX_BODY_LINES = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/**
 * Mise en page d'une scène de quiz : questions numérotées, choix lettrés en retrait. Les réponses
 * n'y figurent pas, la carte pose la question que la voix off développe. Renvoie null pour toute
 * autre scène, qui garde le texte lu à plat.
 */
function quizCardLines(content: unknown): CardLine[] | null {
  if (!isRecord(content) || content.type !== 'quiz' || !Array.isArray(content.questions))
    return null;
  const lines: CardLine[] = [];
  const questions = content.questions.filter(isRecord);
  for (const [index, question] of questions.entries()) {
    const block: CardLine[] = wrapText(`${index + 1}. ${plainText(question.question)}`, 70, 2).map(
      (text) => ({ text, kind: 'question' as const }),
    );
    const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
    for (const option of options.slice(0, 4)) {
      const label = plainText(option.label);
      if (!label) continue;
      const letter = plainText(option.value);
      block.push(
        ...wrapText(letter ? `${letter}. ${label}` : label, 66, 1).map((text) => ({
          text,
          kind: 'option' as const,
        })),
      );
    }
    const remaining = questions.length - index;
    // Une question coupée en deux n'apprend rien : seules les questions entières tiennent sur la carte.
    if (
      lines.length + block.length + (remaining > 1 ? 1 : 0) > MAX_BODY_LINES &&
      lines.length > 0
    ) {
      lines.push({ text: `+ ${remaining} question${remaining > 1 ? 's' : ''}`, kind: 'more' });
      break;
    }
    lines.push(...block);
  }
  return lines.length ? lines.slice(0, MAX_BODY_LINES) : null;
}

function bodyTspan(line: CardLine, index: number): string {
  const x = line.kind === 'option' ? 160 : 116;
  const dy = index === 0 ? 0 : line.kind === 'question' ? 58 : 42;
  const style =
    line.kind === 'question'
      ? ' fill="#ffffff" font-weight="700"'
      : line.kind === 'more'
        ? ' fill="#a5b4fc" font-weight="700"'
        : '';
  return `<tspan x="${x}" dy="${dy}"${style}>${escapeXml(line.text)}</tspan>`;
}

export function buildSceneCardSvg(params: {
  classroomName: string;
  sceneTitle: string;
  sceneType: string;
  sceneNumber: number;
  sceneCount: number;
  content: unknown;
}): string {
  const titleLines = wrapText(params.sceneTitle || params.classroomName, 42, 2);
  const bodyLines: CardLine[] =
    quizCardLines(params.content) ??
    wrapText(sceneReadableText(params.content), 76, MAX_BODY_LINES).map((text) => ({
      text,
      kind: 'text' as const,
    }));
  const title = titleLines
    .map((line, index) => `<tspan x="112" dy="${index === 0 ? 0 : 66}">${escapeXml(line)}</tspan>`)
    .join('');
  const body = bodyLines.map(bodyTspan).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="1750" cy="160" r="310" fill="#8b5cf6" opacity="0.08"/>
  <rect x="96" y="82" width="1728" height="916" rx="42" fill="#0f172a" opacity="0.76" stroke="#ffffff" stroke-opacity="0.12"/>
  <rect x="112" y="118" width="148" height="12" rx="6" fill="url(#accent)"/>
  <text x="112" y="184" fill="#a5b4fc" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">QALEM · ${escapeXml(params.sceneType.toUpperCase())}</text>
  <text x="112" y="286" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="700">${title}</text>
  <text x="116" y="455" fill="#dbeafe" font-family="Arial, sans-serif" font-size="31" font-weight="400">${body}</text>
  <text x="112" y="944" fill="#94a3b8" font-family="Arial, sans-serif" font-size="24">${escapeXml(params.classroomName)}</text>
  <text x="1738" y="944" text-anchor="end" fill="#c4b5fd" font-family="Arial, sans-serif" font-size="26" font-weight="700">${params.sceneNumber} / ${params.sceneCount}</text>
</svg>`;
}
