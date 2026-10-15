import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({
  translate: () => '<b onmouseover="x()">traduction</b>',
}));

import { renderCertificateHTML } from '@/lib/certificates/generator';

describe('renderCertificateHTML translations', () => {
  it('escapes translated labels too, so a corrupted locale file cannot inject markup', () => {
    const html = renderCertificateHTML(
      {
        id: 'c1',
        userId: 'u1',
        stageId: 's1',
        courseName: 'Cours',
        learnerName: 'Amina',
        completionDate: new Date('2026-09-02T12:00:00.000Z'),
        score: 80,
        skills: [],
        verificationCode: 'QAL-2026-TEST0001',
        verificationUrl: 'https://app.qalem.ma/verify/QAL-2026-TEST0001',
        issuedBy: 'Org',
      },
      'fr-FR',
    );
    expect(html).not.toContain('<b onmouseover');
    expect(html).toContain('&lt;b onmouseover=&quot;x()&quot;&gt;traduction&lt;/b&gt;');
  });
});
