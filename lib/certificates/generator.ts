import type { Certificate, CertificateRow } from './types';
import { CERTIFICATE_SCORE_THRESHOLD } from './types';
import { translate } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Verification code generation
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/**
 * Generate a verification code: QAL-{YEAR}-{RANDOM8}
 */
export function generateVerificationCode(): string {
  const year = new Date().getFullYear();
  let random = '';
  const bytes = new Uint8Array(8);
  // Use crypto.getRandomValues when available, else fallback
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < 8; i++) {
    random += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `QAL-${year}-${random}`;
}

// ---------------------------------------------------------------------------
// Build a Certificate object from DB row
// ---------------------------------------------------------------------------

export function certificateFromRow(row: CertificateRow, baseUrl: string): Certificate {
  return {
    id: row.id,
    userId: row.user_id,
    stageId: row.stage_id,
    courseName: row.course_name,
    learnerName: row.learner_name,
    completionDate: new Date(row.completion_date),
    score: row.score,
    skills: row.skills ?? [],
    verificationCode: row.verification_code,
    verificationUrl: `${baseUrl}/verify/${row.verification_code}`,
    issuedBy: row.issued_by,
    orgId: row.org_id ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// HTML certificate renderer
// ---------------------------------------------------------------------------

function formatDate(date: Date, locale: Locale): string {
  const localeMap: Record<Locale, string> = {
    'fr-FR': 'fr-FR',
    'ar-MA': 'ar-MA',
    'en-US': 'en-US',
    'zh-CN': 'zh-CN',
  };
  return date.toLocaleDateString(localeMap[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isRtl(locale: Locale): boolean {
  return locale === 'ar-MA';
}

/**
 * Generate a self-contained HTML certificate suitable for rendering or PDF export.
 *
 * The QR code is produced via a public API (api.qrserver.com) to avoid
 * pulling in a heavy client-side QR library.
 */
export function renderCertificateHTML(cert: Certificate, locale: Locale): string {
  const t = (key: string) => translate(locale, key);
  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(cert.verificationUrl)}`;
  const formattedDate = formatDate(cert.completionDate, locale);
  const scorePercent = Math.round(cert.score);
  const skillsList = cert.skills.length > 0
    ? cert.skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join(' ')
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${t('certificate.title')} — ${escapeHtml(cert.learnerName)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Kufi+Arabic:wght@400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Noto Kufi Arabic', sans-serif;
    background: #f8f9fa;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .cert-container {
    width: 820px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 16px;
    padding: 56px 64px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    position: relative;
    overflow: hidden;
    direction: ${dir};
  }

  /* Decorative top accent */
  .cert-container::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, #2563eb, #7c3aed, #2563eb);
  }

  .cert-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .cert-logo {
    font-size: 1.75rem;
    font-weight: 700;
    color: #2563eb;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .cert-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .cert-divider {
    width: 80px;
    height: 3px;
    background: #2563eb;
    margin: 1.5rem auto;
    border-radius: 2px;
  }

  .cert-issued-to {
    text-align: center;
    color: #64748b;
    font-size: 0.95rem;
    margin-bottom: 0.25rem;
  }

  .cert-learner-name {
    text-align: center;
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 1.5rem;
  }

  .cert-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 2rem;
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: #f1f5f9;
    border-radius: 10px;
  }

  .cert-detail-label {
    font-size: 0.8rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.15rem;
  }

  .cert-detail-value {
    font-size: 1rem;
    color: #1e293b;
    font-weight: 600;
  }

  .skills-section {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .skill-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 500;
    margin: 0.2rem;
  }

  .cert-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e2e8f0;
  }

  .cert-qr img {
    width: 120px;
    height: 120px;
    border-radius: 8px;
  }

  .cert-verify-info {
    flex: 1;
    text-align: ${isRtl(locale) ? 'right' : 'left'};
  }

  .cert-verify-label {
    font-size: 0.8rem;
    color: #64748b;
  }

  .cert-verify-code {
    font-size: 1.1rem;
    font-weight: 700;
    color: #2563eb;
    font-family: 'Geist Mono', monospace;
    letter-spacing: 0.05em;
  }

  .cert-verify-url {
    font-size: 0.78rem;
    color: #94a3b8;
    word-break: break-all;
  }

  .cert-issuer {
    text-align: ${isRtl(locale) ? 'left' : 'right'};
    color: #64748b;
    font-size: 0.85rem;
  }

  .cert-issuer strong {
    display: block;
    color: #1e293b;
    font-size: 0.95rem;
  }

  /* Print-friendly */
  @media print {
    body { background: white; padding: 0; }
    .cert-container {
      box-shadow: none;
      border: 1px solid #e2e8f0;
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
<div class="cert-container">
  <div class="cert-header">
    <div class="cert-logo">Qalem</div>
    <div class="cert-title">${t('certificate.title')}</div>
  </div>

  <div class="cert-divider"></div>

  <div class="cert-issued-to">${t('certificate.issuedTo')}</div>
  <div class="cert-learner-name">${escapeHtml(cert.learnerName)}</div>

  <div class="cert-details">
    <div>
      <div class="cert-detail-label">${t('certificate.course')}</div>
      <div class="cert-detail-value">${escapeHtml(cert.courseName)}</div>
    </div>
    <div>
      <div class="cert-detail-label">${t('certificate.date')}</div>
      <div class="cert-detail-value">${formattedDate}</div>
    </div>
    <div>
      <div class="cert-detail-label">${t('certificate.score')}</div>
      <div class="cert-detail-value">${scorePercent} / 100</div>
    </div>
    <div>
      <div class="cert-detail-label">${t('certificate.issuedByLabel')}</div>
      <div class="cert-detail-value">${escapeHtml(cert.issuedBy)}</div>
    </div>
  </div>

  ${skillsList ? `<div class="skills-section">${skillsList}</div>` : ''}

  <div class="cert-footer">
    <div class="cert-qr">
      <img src="${qrUrl}" alt="QR Code" width="120" height="120" />
    </div>
    <div class="cert-verify-info">
      <div class="cert-verify-label">${t('certificate.verify')}</div>
      <div class="cert-verify-code">${escapeHtml(cert.verificationCode)}</div>
      <div class="cert-verify-url">${escapeHtml(cert.verificationUrl)}</div>
    </div>
    <div class="cert-issuer">
      <strong>${escapeHtml(cert.issuedBy)}</strong>
      Qalem
    </div>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validate that a score meets the certificate threshold. */
export function meetsScoreThreshold(score: number): boolean {
  return score >= CERTIFICATE_SCORE_THRESHOLD;
}
