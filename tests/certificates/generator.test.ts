import { describe, expect, it } from 'vitest';
import { renderCertificateHTML } from '@/lib/certificates/generator';
import { renderQrSvgDataUri } from '@/lib/certificates/qr';
import type { Certificate } from '@/lib/certificates/types';

const HOSTILE = `<script>alert(1)</script><img src=x onerror="alert(2)">'"&`;

function certificate(overrides: Partial<Certificate> = {}): Certificate {
  return {
    id: 'c1',
    userId: 'u1',
    stageId: 's1',
    courseName: 'Pilotage budgétaire',
    learnerName: 'Amina',
    completionDate: new Date('2026-09-02T12:00:00.000Z'),
    score: 82.4,
    skills: ['Arbitrage'],
    verificationCode: 'QAL-2026-TEST0001',
    verificationUrl: 'https://app.qalem.ma/verify/QAL-2026-TEST0001',
    issuedBy: 'Organisation test',
    ...overrides,
  };
}

function decodeDataUri(uri: string): string {
  const prefix = 'data:image/svg+xml;base64,';
  expect(uri.startsWith(prefix)).toBe(true);
  return Buffer.from(uri.slice(prefix.length), 'base64').toString('utf8');
}

describe('renderQrSvgDataUri', () => {
  it('returns a self-contained SVG data URI with dark modules and no external reference', () => {
    const svg = decodeDataUri(renderQrSvgDataUri('https://app.qalem.ma/verify/QAL-2026-TEST0001'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('is deterministic and depends on the encoded text', () => {
    const a = renderQrSvgDataUri('https://app.qalem.ma/verify/A');
    expect(renderQrSvgDataUri('https://app.qalem.ma/verify/A')).toBe(a);
    expect(renderQrSvgDataUri('https://app.qalem.ma/verify/B')).not.toBe(a);
  });

  it('encodes non-ASCII text (Arabic, emoji) without throwing', () => {
    expect(() => renderQrSvgDataUri('https://qalem.ma/verify/شهادة-🎓')).not.toThrow();
  });
});

describe('renderCertificateHTML', () => {
  it('never contacts a third-party QR service and embeds the QR inline', () => {
    const html = renderCertificateHTML(certificate(), 'fr-FR');
    expect(html).not.toContain('qrserver');
    expect(html).toMatch(/<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" alt="QR Code"/);
  });

  it('escapes every interpolated certificate value', () => {
    const html = renderCertificateHTML(
      certificate({
        courseName: HOSTILE,
        learnerName: HOSTILE,
        issuedBy: HOSTILE,
        skills: [HOSTILE],
        verificationCode: HOSTILE,
        verificationUrl: `https://x.example/${HOSTILE}`,
      }),
      'en-US',
    );
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert(2)"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('carries a CSP that forbids scripts, frames, forms and network connections', () => {
    const html = renderCertificateHTML(certificate(), 'ar-MA');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('script-src');
    expect(csp).toContain('img-src data:');
    expect(csp).not.toContain('connect-src');
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<style>'));
  });

  it('keeps the right-to-left direction for Arabic', () => {
    expect(renderCertificateHTML(certificate(), 'ar-MA')).toContain('dir="rtl"');
  });
});
