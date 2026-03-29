'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { CheckCircle2, XCircle, Loader2, Download, Share2 } from 'lucide-react';
import { renderCertificateHTML } from '@/lib/certificates/generator';
import type { Certificate } from '@/lib/certificates/types';

interface VerifiedCertificate {
  courseName: string;
  learnerName: string;
  completionDate: string;
  score: number;
  skills: string[];
  verificationCode: string;
  issuedBy: string;
}

type PageState =
  | { status: 'loading' }
  | { status: 'verified'; cert: VerifiedCertificate }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

export default function VerifyCertificatePage() {
  const params = useParams<{ code: string }>();
  const { t, locale } = useI18n();
  const [state, setState] = useState<PageState>({ status: 'loading' });

  const code = params.code;

  /* eslint-disable react-hooks/set-state-in-effect -- Async data fetch in effect */
  useEffect(() => {
    if (!code) {
      setState({ status: 'not_found' });
      return;
    }

    async function fetchCertificate() {
      try {
        const res = await fetch(`/api/certificates/verify/${encodeURIComponent(code)}`);
        const json = await res.json();

        if (res.status === 404 || !json.success) {
          setState({ status: 'not_found' });
          return;
        }

        setState({ status: 'verified', cert: json.certificate });
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    fetchCertificate();
  }, [code]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- OpenGraph meta via document.title (client-side) ---
  useEffect(() => {
    if (state.status === 'verified') {
      document.title = `${t('certificate.verified')} — ${state.cert.learnerName} | Qalem`;
    } else if (state.status === 'not_found') {
      document.title = `${t('certificate.notFound')} | Qalem`;
    }
  }, [state, t]);

  const isRtl = locale === 'ar-MA';

  // --- Download PDF (opens the HTML certificate in a new window for print) ---
  function handleDownload() {
    if (state.status !== 'verified') return;

    const cert: Certificate = {
      id: '',
      userId: '',
      stageId: '',
      courseName: state.cert.courseName,
      learnerName: state.cert.learnerName,
      completionDate: new Date(state.cert.completionDate),
      score: state.cert.score,
      skills: state.cert.skills,
      verificationCode: state.cert.verificationCode,
      verificationUrl: `${window.location.origin}/verify/${state.cert.verificationCode}`,
      issuedBy: state.cert.issuedBy,
    };

    const html = renderCertificateHTML(cert, locale);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.print();
      });
    }
  }

  // --- Share on LinkedIn ---
  function handleShare() {
    if (state.status !== 'verified') return;
    const shareUrl = `${window.location.origin}/verify/${state.cert.verificationCode}`;
    const text = `${t('certificate.title')} — ${state.cert.courseName}`;
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text)}`;
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-950"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-lg">
        {/* Loading */}
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p>{t('common.loading')}</p>
          </div>
        )}

        {/* Verified */}
        {state.status === 'verified' && (
          <div className="rounded-2xl border border-green-200 bg-white p-8 shadow-lg dark:border-green-800 dark:bg-gray-900">
            <div className="mb-6 flex flex-col items-center gap-2">
              <CheckCircle2 className="h-14 w-14 text-green-500" />
              <h1 className="text-xl font-bold text-green-700 dark:text-green-400">
                {t('certificate.verified')}
              </h1>
            </div>

            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('certificate.issuedTo')}
                </dt>
                <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {state.cert.learnerName}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('certificate.course')}
                </dt>
                <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {state.cert.courseName}
                </dd>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('certificate.date')}
                  </dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(state.cert.completionDate).toLocaleDateString(locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('certificate.score')}
                  </dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {Math.round(state.cert.score)} / 100
                  </dd>
                </div>
              </div>

              {state.cert.skills.length > 0 && (
                <div>
                  <dt className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('certificate.skills')}
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {state.cert.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('certificate.issuedByLabel')}
                </dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {state.cert.issuedBy}
                </dd>
              </div>

              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('certificate.verify')}
                </dt>
                <dd className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                  {state.cert.verificationCode}
                </dd>
              </div>
            </dl>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                {t('certificate.download')}
              </button>
              <button
                onClick={handleShare}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Share2 className="h-4 w-4" />
                {t('certificate.share')}
              </button>
            </div>
          </div>
        )}

        {/* Not found */}
        {state.status === 'not_found' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-white p-8 shadow-lg dark:border-red-800 dark:bg-gray-900">
            <XCircle className="h-14 w-14 text-red-400" />
            <h1 className="text-xl font-bold text-red-600 dark:text-red-400">
              {t('certificate.notFound')}
            </h1>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              {t('certificate.notFoundDetail')}
            </p>
          </div>
        )}

        {/* Error */}
        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-white p-8 shadow-lg dark:border-red-800 dark:bg-gray-900">
            <XCircle className="h-14 w-14 text-red-400" />
            <h1 className="text-xl font-bold text-red-600 dark:text-red-400">
              {t('certificate.notFound')}
            </h1>
            <p className="text-center text-sm text-gray-500">{state.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
