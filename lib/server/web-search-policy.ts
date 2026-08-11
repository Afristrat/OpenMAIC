interface ClassroomWebSearchPolicyInput {
  enabled: boolean | undefined;
  hasUploadedSource: boolean;
  requirement: string;
}

const EXCLUSIVE_SOURCE_PATTERNS = [
  /\b(?:exclusivement|uniquement)\b.{0,60}\b(?:pdf|document|source|fichier)\b/iu,
  /\b(?:pdf|document|source|fichier)\b.{0,60}\b(?:exclusivement|uniquement)\b/iu,
  /\b(?:only|exclusively)\b.{0,60}\b(?:pdf|document|source|file|attachment)\b/iu,
  /\b(?:pdf|document|source|file|attachment)\b.{0,60}\b(?:only|exclusively)\b/iu,
  /(?:حصريًا|فقط).{0,60}(?:المصدر|الوثيقة|الملف)/u,
  /(?:المصدر|الوثيقة|الملف).{0,60}(?:حصريًا|فقط)/u,
];

export function shouldRunClassroomWebSearch({
  enabled,
  hasUploadedSource,
  requirement,
}: ClassroomWebSearchPolicyInput): boolean {
  if (!enabled) return false;
  if (!hasUploadedSource) return true;
  return !EXCLUSIVE_SOURCE_PATTERNS.some((pattern) => pattern.test(requirement));
}
