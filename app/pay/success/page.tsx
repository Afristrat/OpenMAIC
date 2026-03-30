/**
 * Payment Success Page
 *
 * Simple success confirmation with checkmark animation and
 * a "Back to home" button.
 */

'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home } from 'lucide-react';

export default function PaySuccessPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      {/* Animated checkmark */}
      <div className="mb-6 animate-bounce">
        <CheckCircle2 className="h-20 w-20 text-green-500" strokeWidth={1.5} />
      </div>

      <h1 className="mb-2 text-2xl font-bold">{t('payment.successTitle')}</h1>
      <p className="mb-8 text-muted-foreground">{t('payment.successMessage')}</p>

      <Link href="/app">
        <Button size="lg" className="gap-2">
          <Home className="h-4 w-4" />
          {t('payment.backToHome')}
        </Button>
      </Link>
    </div>
  );
}
