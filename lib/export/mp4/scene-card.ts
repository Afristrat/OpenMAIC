const SKIPPED_KEYS = new Set([
  'id',
  'src',
  'url',
  'audioId',
  'audioUrl',
  'html',
  'background',
]);

function collectStrings(value: unknown, key: string | null, output: string[]): void {
  if (output.join(' ').length >= 1400) return;
  if (typeof value === 'string') {
    const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text && !text.startsWith('http') && key !== 'type') output.push(text);
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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapText(value: string, maxCharacters: number, maxLines: number): string[] {
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

export function buildSceneCardSvg(params: {
  classroomName: string;
  sceneTitle: string;
  sceneType: string;
  sceneNumber: number;
  sceneCount: number;
  content: unknown;
}): string {
  const titleLines = wrapText(params.sceneTitle || params.classroomName, 42, 2);
  const bodyLines = wrapText(sceneReadableText(params.content), 76, 10);
  const title = titleLines
    .map((line, index) => `<tspan x="112" dy="${index === 0 ? 0 : 66}">${escapeXml(line)}</tspan>`)
    .join('');
  const body = bodyLines
    .map((line, index) => `<tspan x="116" dy="${index === 0 ? 0 : 42}">${escapeXml(line)}</tspan>`)
    .join('');

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
