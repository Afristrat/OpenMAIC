function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function meaningfulMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const message = value.trim();
  if (!message || ['<none>', 'undefined', 'null'].includes(message.toLowerCase())) return undefined;
  return message.slice(0, 1_000);
}

export function formatGenerationError(error: unknown): string {
  if (!isRecord(error)) return meaningfulMessage(String(error)) ?? 'Unknown generation error';

  const details: string[] = [];
  const message = meaningfulMessage(error.message);
  const name = meaningfulMessage(error.name);
  const status = error.statusCode ?? error.status;
  const cause = isRecord(error.cause) ? error.cause : undefined;
  const causeMessage = meaningfulMessage(cause?.message);

  if (message) details.push(message);
  if (name && name !== 'Error' && name !== message) details.push(name);
  if (typeof status === 'number' || typeof status === 'string') details.push(`HTTP ${status}`);
  if (causeMessage && causeMessage !== message) details.push(causeMessage);

  return [...new Set(details)].join(' · ') || 'Unknown generation error';
}
