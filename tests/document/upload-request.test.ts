import { describe, expect, it } from 'vitest';
import { buildDocumentParseFormData } from '@/lib/document/upload-request';

describe('buildDocumentParseFormData', () => {
  it('sends the PDF parser selected by the author with its client configuration', () => {
    const file = new File(['%PDF-1.4'], 'source.pdf', { type: 'application/pdf' });

    const formData = buildDocumentParseFormData(file, {
      providerId: 'mineru',
      apiKey: 'client-key',
      baseUrl: 'https://mineru.example/v1',
    });

    expect(formData.get('pdf')).toBe(file);
    expect(formData.get('providerId')).toBe('mineru');
    expect(formData.get('apiKey')).toBe('client-key');
    expect(formData.get('baseUrl')).toBe('https://mineru.example/v1');
  });

  it('uses the document field for supported non-PDF sources', () => {
    const file = new File(['# Source'], 'source.md', { type: 'text/markdown' });

    const formData = buildDocumentParseFormData(file, {
      providerId: 'unpdf',
    });

    expect(formData.get('document')).toBe(file);
    expect(formData.get('pdf')).toBeNull();
    expect(formData.get('providerId')).toBeNull();
  });
});
