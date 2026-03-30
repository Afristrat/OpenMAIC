'use client';

import { Component, type ReactNode } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Client-side error boundary that catches rendering errors,
 * logs them, and displays a user-friendly recovery UI.
 *
 * i18n keys are read from localStorage to avoid depending on React context
 * (which may not be available when the error boundary catches).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    log.error('React rendering error:', error.message, errorInfo.componentStack ?? '');
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Read locale from localStorage for i18n (context may be unavailable)
    const locale = getLocaleFromStorage();
    const strings = ERROR_STRINGS[locale] ?? ERROR_STRINGS['fr-FR'];

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          color: '#374151',
          backgroundColor: '#f9fafb',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            padding: '2rem',
            borderRadius: '0.75rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              width: '3rem',
              height: '3rem',
              margin: '0 auto 1rem',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: '#dc2626',
            }}
          >
            !
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#111827',
            }}
          >
            {strings.title}
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: 1.5,
            }}
          >
            {strings.message}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem',
              backgroundColor: '#722ed1',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {strings.retry}
          </button>
        </div>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// i18n helpers (context-free, uses localStorage directly)
// ---------------------------------------------------------------------------

type SupportedLocale = 'fr-FR' | 'ar-MA' | 'en-US' | 'zh-CN';

const ERROR_STRINGS: Record<SupportedLocale, { title: string; message: string; retry: string }> = {
  'fr-FR': {
    title: 'Une erreur est survenue',
    message: 'Une erreur inattendue s\u2019est produite lors du chargement de cette page.',
    retry: 'Rafra\u00EEchir la page',
  },
  'en-US': {
    title: 'Something went wrong',
    message: 'An unexpected error occurred while loading this page.',
    retry: 'Try again',
  },
  'ar-MA': {
    title: '\u062D\u062F\u062B \u062E\u0637\u0623',
    message: '\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0651\u0639 \u0623\u062B\u0646\u0627\u0621 \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.',
    retry: '\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629',
  },
  'zh-CN': {
    title: '\u51FA\u73B0\u9519\u8BEF',
    message: '\u52A0\u8F7D\u6B64\u9875\u9762\u65F6\u51FA\u73B0\u610F\u5916\u9519\u8BEF\u3002',
    retry: '\u91CD\u8BD5',
  },
};

function getLocaleFromStorage(): SupportedLocale {
  try {
    const stored = localStorage.getItem('locale');
    if (stored && stored in ERROR_STRINGS) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage unavailable (SSR or permission denied)
  }
  return 'fr-FR';
}
