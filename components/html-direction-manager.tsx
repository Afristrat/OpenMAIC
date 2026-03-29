'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Sets `dir` and `lang` attributes on <html> based on the current locale.
 * Must be rendered inside I18nProvider.
 */
export function HtmlDirectionManager() {
  const { locale } = useI18n();

  useEffect(() => {
    const html = document.documentElement;
    const isRTL = locale === 'ar-MA';
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    html.setAttribute('lang', locale);
  }, [locale]);

  return null;
}
