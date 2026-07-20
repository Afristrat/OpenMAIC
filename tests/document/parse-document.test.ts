import { describe, expect, it } from 'vitest';
import { decodeOfficeXml } from '@/lib/document/decode-office-xml';

describe('decodeOfficeXml', () => {
  it('extracts readable paragraphs and decodes entities', () => {
    const xml = '<a:p><a:r><a:t>LiteLLM &amp; Qalem</a:t></a:r></a:p><a:p><a:t>Suite</a:t></a:p>';
    expect(decodeOfficeXml(xml)).toBe('LiteLLM & Qalem\nSuite');
  });
});
