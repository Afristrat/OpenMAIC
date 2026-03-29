'use client';

import { useState, useEffect, useCallback } from 'react';
import { Award, Calendar, Hash, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { tryCreateClient } from '@/lib/supabase/client';
import { renderCertificateHTML } from '@/lib/certificates/generator';
import { cn } from '@/lib/utils';
import {
  CertificateModal,
  loadGuestCertificates,
  type GuestCertificateData,
} from '@/components/certificate-prompt';
import { NavigationSidebar } from '@/components/navigation-sidebar';
import type { Certificate } from '@/lib/certificates/types';
import type { Locale } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CertificateCardData {
  id: string;
  courseName: string;
  completionDate: string;
  score: number;
  verificationCode: string;
  verificationUrl: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CertificatesPage(): React.ReactElement {
  const { t, locale } = useI18n();
  const { user, isGuest, isLoading: authLoading } = useAuth();

  const [certificates, setCertificates] = useState<CertificateCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<CertificateCardData | null>(null);

  const isRtl = locale === 'ar-MA';

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    try {
      if (isGuest || !user) {
        // Load from localStorage for guests
        const guestCerts = loadGuestCertificates();
        const cards: CertificateCardData[] = guestCerts.map((gc: GuestCertificateData) => ({
          id: gc.certificate.id,
          courseName: gc.certificate.courseName,
          completionDate: gc.certificate.completionDate,
          score: gc.certificate.score,
          verificationCode: gc.certificate.verificationCode,
          verificationUrl: gc.certificate.verificationUrl,
          html: gc.html,
        }));
        setCertificates(cards);
      } else {
        // Load from Supabase for authenticated users
        const supabase = tryCreateClient();
        if (!supabase) return;

        const { data, error } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .order('completion_date', { ascending: false });

        if (error) {
          console.error('Failed to load certificates:', error);
          return;
        }

        if (data) {
          const baseUrl = `${window.location.protocol}//${window.location.host}`;
          const cards: CertificateCardData[] = data.map((row) => {
            const cert: Certificate = {
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
            return {
              id: row.id,
              courseName: row.course_name,
              completionDate: row.completion_date,
              score: row.score,
              verificationCode: row.verification_code,
              verificationUrl: cert.verificationUrl,
              html: renderCertificateHTML(cert, locale as Locale),
            };
          });
          setCertificates(cards);
        }
      }
    } catch (error) {
      console.error('Failed to load certificates:', error);
    } finally {
      setLoading(false);
    }
  }, [isGuest, user, locale]);

  useEffect(() => {
    if (!authLoading) {
      loadCertificates();
    }
  }, [authLoading, loadCertificates]);

  const formatDate = (dateStr: string): string => {
    try {
      const localeMap: Record<string, string> = {
        'fr-FR': 'fr-FR',
        'ar-MA': 'ar-MA',
        'en-US': 'en-US',
        'zh-CN': 'zh-CN',
      };
      return new Date(dateStr).toLocaleDateString(localeMap[locale] ?? 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const scoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30';
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
  };

  return (
    <div className={cn('flex min-h-screen bg-gray-50 dark:bg-gray-950', isRtl && 'flex-row-reverse')}>
      <NavigationSidebar />

      <main
        className={cn(
          'flex-1 px-6 py-8 lg:px-12',
          isRtl ? 'lg:mr-60' : 'lg:ml-60',
        )}
      >
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('certificate.myCertificates')}
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : certificates.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center mb-6">
              <Award className="size-10 text-purple-300 dark:text-purple-700" />
            </div>
            <p className="text-base text-gray-500 dark:text-gray-400 max-w-sm">
              {t('certificate.noCertificates')}
            </p>
          </div>
        ) : (
          /* Certificate grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {certificates.map((cert) => (
              <button
                key={cert.id}
                onClick={() => setSelectedCert(cert)}
                className="group text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all"
              >
                {/* Top accent */}
                <div className="h-1 -mt-5 -mx-5 mb-4 rounded-t-xl bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500" />

                {/* Course name */}
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 line-clamp-2 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                  {cert.courseName}
                </h3>

                {/* Details */}
                <div className="space-y-2">
                  {/* Date */}
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar className="size-3.5 shrink-0" />
                    <span>{formatDate(cert.completionDate)}</span>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold',
                        scoreColor(cert.score),
                      )}
                    >
                      {Math.round(cert.score)}%
                    </span>
                  </div>

                  {/* Verification code */}
                  <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                    <Hash className="size-3.5 shrink-0" />
                    <span className="font-mono text-xs">{cert.verificationCode}</span>
                  </div>
                </div>

                {/* View prompt */}
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('certificate.viewCertificate')}
                  <ChevronRight className="size-3" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Modal */}
        {selectedCert && (
          <CertificateModal
            html={selectedCert.html}
            verificationUrl={selectedCert.verificationUrl}
            courseName={selectedCert.courseName}
            onClose={() => setSelectedCert(null)}
          />
        )}
      </main>
    </div>
  );
}
