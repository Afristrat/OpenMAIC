import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreditStatusNotice } from '@/components/billing/credit-status-notice';
import { formatCredits, readInsufficientCredits } from '@/lib/billing/credit-status-view';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'fr-FR',
    t: (key: string, params?: Record<string, string>) =>
      `${key}|${params?.balance ?? ''}|${params?.required ?? ''}`,
  }),
}));

const base = {
  balanceCredits: 1.5,
  enforcementEnabled: true,
  minimumRequiredCredits: 7,
  lowBalanceThresholdCredits: 14,
};

describe('lecture de la réponse 402', () => {
  it('convertit les micro-unités en crédits', () => {
    expect(
      readInsufficientCredits({
        errorCode: 'INSUFFICIENT_CREDITS',
        details: JSON.stringify({ balanceMicrounits: 1_500_000, requiredMicrounits: 7_000_000 }),
      }),
    ).toEqual({ balanceCredits: 1.5, requiredCredits: 7 });
  });

  it('ignore toute autre erreur et tolère des détails illisibles', () => {
    expect(readInsufficientCredits({ errorCode: 'RATE_LIMITED' })).toBeNull();
    expect(readInsufficientCredits(null)).toBeNull();
    expect(readInsufficientCredits({ errorCode: 'INSUFFICIENT_CREDITS', details: '{' })).toEqual({
      balanceCredits: null,
      requiredCredits: null,
    });
  });

  it('formate selon la langue', () => {
    expect(formatCredits(1.5, 'en-US')).toBe('1.5');
  });
});

describe('CreditStatusNotice', () => {
  it('annonce le blocage comme une alerte avec le solde, le besoin et la revérification', () => {
    const html = renderToStaticMarkup(
      createElement(CreditStatusNotice, {
        status: { ...base, blocked: true, lowBalance: true },
        onRecheck: () => undefined,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('billing.credits.insufficient|1,5|7');
    expect(html).toContain('billing.credits.recheck');
  });

  it('signale un solde bas sans alerte', () => {
    const html = renderToStaticMarkup(
      createElement(CreditStatusNotice, { status: { ...base, blocked: false, lowBalance: true } }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('billing.credits.low');
    expect(html).not.toContain('billing.credits.recheck');
  });

  it('ne montre rien quand le solde suffit ou reste inconnu', () => {
    expect(
      renderToStaticMarkup(
        createElement(CreditStatusNotice, {
          status: { ...base, blocked: false, lowBalance: false },
        }),
      ),
    ).toBe('');
    expect(renderToStaticMarkup(createElement(CreditStatusNotice, { status: null }))).toBe('');
  });
});
