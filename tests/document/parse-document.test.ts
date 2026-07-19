import { describe, expect, it } from 'vitest';
import { decodeOfficeXml } from '@/app/api/parse-document/route';

describe('decodeOfficeXml', () => {
  it('extracts readable paragraphs and decodes entities', () => {
    const xml = '<a:p><a:r><a:t>LiteLLM &amp; Qalem</a:t></a:r></a:p><a:p><a:t>Suite</a:t></a:p>';
    expect(decodeOfficeXml(xml)).toBe('LiteLLM & Qalem\nSuite');
  });
});
