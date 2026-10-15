'use client';

import { useState, useCallback, useEffect } from 'react';
import { Award, Download, Linkedin, Link2, Check, X, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { useClassroomOrganizationId } from '@/lib/contexts/classroom-organization';
import { cn } from '@/lib/utils';
import type { Certificate } from '@/lib/certificates/types';
import { renderCertificateHTML } from '@/lib/certificates/generator';
import type { Locale } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Local storage helpers for guest certificates
// ---------------------------------------------------------------------------

const GUEST_CERTS_KEY = 'qalem-guest-certificates';

/**
 * Seules les données du certificat sont persistées : le HTML est toujours régénéré (et ses
 * valeurs échappées) à l'affichage, jamais relu depuis le stockage local, que n'importe quel
 * script de l'origine peut modifier.
 */
interface GuestCertificateData {
  certificate: Certificate & { completionDate: string };
}

function loadGuestCertificates(): GuestCertificateData[] {
  try {
    const raw = localStorage.getItem(GUEST_CERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuestCertificate(data: GuestCertificateData): void {
  try {
    const existing = loadGuestCertificates();
    const filtered = existing.filter((c) => c.certificate.stageId !== data.certificate.stageId);
    filtered.push(data);
    localStorage.setItem(GUEST_CERTS_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage unavailable
  }
}

function findGuestCertificate(stageId: string): GuestCertificateData | undefined {
  return loadGuestCertificates().find((c) => c.certificate.stageId === stageId);
}

function rehydrateGuestCertificate(data: GuestCertificateData): Certificate {
  return { ...data.certificate, completionDate: new Date(data.certificate.completionDate) };
}

function guestCertificateHtml(data: GuestCertificateData, locale: Locale): string {
  return renderCertificateHTML(rehydrateGuestCertificate(data), locale);
}

export { loadGuestCertificates, guestCertificateHtml, type GuestCertificateData };

// ---------------------------------------------------------------------------
// Certificate Modal
// ---------------------------------------------------------------------------

function CertificateModal({
  html,
  verificationUrl,
  courseName,
  onClose,
}: {
  html: string;
  verificationUrl: string;
  courseName: string;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [linkCopied, setLinkCopied] = useState(false);

  const handleDownload = useCallback(() => {
    // Open the certificate as a Blob document (no document.write) and print it once loaded.
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const win = window.open(url, '_blank');
    if (win) {
      // Wait for fonts/images to load before triggering print
      win.addEventListener('load', () => {
        setTimeout(() => {
          win.print();
          URL.revokeObjectURL(url);
        }, 500);
      });
    } else {
      URL.revokeObjectURL(url);
    }
  }, [html]);

  const handleLinkedIn = useCallback(() => {
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verificationUrl)}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }, [verificationUrl]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input');
      input.value = verificationUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [verificationUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-[900px] max-w-[95vw] max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{courseName}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Certificate HTML preview
            The certificate is a full standalone document (own <head>, CSP <meta>, styles):
            it is rendered in a sandboxed iframe so its CSP applies and its styles never
            leak into the application. No `allow-scripts`: nothing can execute in it, so
            `allow-same-origin` is safe and only keeps storage access from throwing.
            All dynamic values are already escaped by renderCertificateHTML(). */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-950">
          <iframe
            title={courseName}
            sandbox="allow-same-origin"
            srcDoc={html}
            className="mx-auto block h-[65vh] w-full rounded-lg border-0 bg-white"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            <Download className="size-4" />
            {t('certificate.download')}
          </button>
          <button
            onClick={handleLinkedIn}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Linkedin className="size-4" />
            {t('certificate.share')}
          </button>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
          >
            {linkCopied ? (
              <>
                <Check className="size-4 text-green-600" />
                {t('certificate.linkCopied')}
              </>
            ) : (
              <>
                <Link2 className="size-4" />
                {t('certificate.copyLink')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export { CertificateModal };

// ---------------------------------------------------------------------------
// Certificate Prompt Banner — shown in classroom when course is complete
// ---------------------------------------------------------------------------

interface CertificatePromptProps {
  stageId: string;
  allScenesCompleted: boolean;
  quizScores: number[]; // Array of quiz scores (0-100). Empty if no quizzes.
}

export function CertificatePrompt({
  stageId,
  allScenesCompleted,
  quizScores,
}: CertificatePromptProps): React.ReactElement | null {
  const { t, locale } = useI18n();
  const { isGuest } = useAuth();
  const orgId = useClassroomOrganizationId();
  const [loading, setLoading] = useState(false);
  const [certHtml, setCertHtml] = useState<string | null>(null);
  const [certData, setCertData] = useState<Certificate | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  // Check if average quiz score meets threshold
  const avgScore =
    quizScores.length > 0 ? quizScores.reduce((sum, s) => sum + s, 0) / quizScores.length : 0;

  const meetsThreshold = quizScores.length > 0 && avgScore >= 60;
  const shouldShow = allScenesCompleted && meetsThreshold;

  // Check for existing guest certificate
  useEffect(() => {
    if (isGuest && stageId) {
      const existing = findGuestCertificate(stageId);
      if (existing) {
        setHasExisting(true);
        setCertHtml(guestCertificateHtml(existing, locale));
        setCertData(rehydrateGuestCertificate(existing));
      }
    }
  }, [isGuest, stageId, locale]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, orgId }),
      });

      const json = await res.json();

      if (json.success && json.certificate) {
        const cert = json.certificate as Certificate;
        cert.completionDate = new Date(cert.completionDate);
        setCertData(cert);
        setHasExisting(true);

        // Render the certificate HTML client-side
        const html = renderCertificateHTML(cert, locale);
        setCertHtml(html);

        // For guests, store in localStorage
        if (isGuest) {
          saveGuestCertificate({
            certificate: {
              ...cert,
              completionDate: cert.completionDate.toISOString(),
            } as Certificate & { completionDate: string },
          });
        }

        setShowModal(true);
      }
    } catch (error) {
      console.error('Failed to generate certificate:', error);
    } finally {
      setLoading(false);
    }
  }, [stageId, isGuest, locale, orgId]);

  const handleView = useCallback(async () => {
    if (certHtml) {
      setShowModal(true);
      return;
    }
    // Re-fetch if we don't have HTML
    await handleGenerate();
  }, [certHtml, handleGenerate]);

  if (!shouldShow) return null;

  return (
    <>
      {/* Banner */}
      <div className="mx-4 mb-3 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200/60 dark:border-purple-800/40 p-4">
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className="shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <Award className="size-5 text-purple-600 dark:text-purple-400" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
              {t('certificate.congratulations')} {t('certificate.courseCompleted')}
            </p>
          </div>

          {/* Button */}
          <button
            onClick={hasExisting ? handleView : handleGenerate}
            disabled={loading}
            className={cn(
              'shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-purple-600 hover:bg-purple-700 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
            {hasExisting ? t('certificate.viewCertificate') : t('certificate.getCertificate')}
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && certHtml && certData && (
        <CertificateModal
          html={certHtml}
          verificationUrl={certData.verificationUrl}
          courseName={certData.courseName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
