import type { PDFProviderId } from '@/lib/pdf/types';

interface DocumentParseProviderConfig {
  providerId: PDFProviderId;
  apiKey?: string;
  baseUrl?: string;
}

export function buildDocumentParseFormData(
  file: File,
  config: DocumentParseProviderConfig,
): FormData {
  const formData = new FormData();
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  formData.append(isPdf ? 'pdf' : 'document', file);
  if (!isPdf) return formData;

  formData.append('providerId', config.providerId);
  if (config.apiKey?.trim()) formData.append('apiKey', config.apiKey.trim());
  if (config.baseUrl?.trim()) formData.append('baseUrl', config.baseUrl.trim());
  return formData;
}
