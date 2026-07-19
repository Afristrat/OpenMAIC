const DEFAULT_RETURN_PATH = '/app';

export function resolveAuthReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const parsed = new URL(value, 'https://qalem.local');
    if (parsed.origin !== 'https://qalem.local') return DEFAULT_RETURN_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}
