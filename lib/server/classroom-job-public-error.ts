export function getPublicGenerationFailureCode(
  error?: string,
): 'MEDIA_PROVIDER_UNAVAILABLE' | undefined {
  return error && /Enabled media generation (?:failed|produced)/i.test(error)
    ? 'MEDIA_PROVIDER_UNAVAILABLE'
    : undefined;
}
