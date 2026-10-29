import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { isValidElement, type ReactElement } from 'react';
import { AccountModelSync } from '@/components/account-model-sync';
import PrivateApplicationLayout, { dynamic } from '@/app/(private)/layout';

describe('private application layout', () => {
  it('forces a runtime authentication decision for every request', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_E2E_TEST_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns authenticated application content', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } });

    const layout = await PrivateApplicationLayout({ children: 'private' });

    // Le contenu est rendu tel quel, accompagné de la recopie du modèle du compte pour l'extension.
    expect(isValidElement(layout)).toBe(true);
    const parts = (layout as ReactElement<{ children: unknown[] }>).props.children;
    expect(parts[0]).toBe('private');
    expect((parts[1] as ReactElement).type).toBe(AccountModelSync);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated request before rendering application content', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(PrivateApplicationLayout({ children: 'private' })).rejects.toThrow(
      'REDIRECT:/auth?next=/app',
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/auth?next=/app');
  });
});
