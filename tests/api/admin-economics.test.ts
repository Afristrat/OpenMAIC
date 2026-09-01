import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  getPlatformMargin: vi.fn(),
  getCurrentEconomicConfiguration: vi.fn(),
  createProviderCostRate: vi.fn(),
  createExchangeRate: vi.fn(),
  setMarginTarget: vi.fn(),
  createTenantSellPrice: vi.fn(),
  getTenantMargin: vi.fn(),
  getTenantMarginBreakdown: vi.fn(),
  getCurrentSellPrices: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/billing/value-pricing', () => ({
  getPlatformMargin: mocks.getPlatformMargin,
  getCurrentEconomicConfiguration: mocks.getCurrentEconomicConfiguration,
  createProviderCostRate: mocks.createProviderCostRate,
  createExchangeRate: mocks.createExchangeRate,
  setMarginTarget: mocks.setMarginTarget,
  createTenantSellPrice: mocks.createTenantSellPrice,
  getTenantMargin: mocks.getTenantMargin,
  getTenantMarginBreakdown: mocks.getTenantMarginBreakdown,
  getCurrentSellPrices: mocks.getCurrentSellPrices,
}));

import { GET as getPlatform, POST as configurePlatform } from '@/app/api/admin/economics/route';
import { POST as setTenantPrice } from '@/app/api/admin/tenants/[tenantId]/economics/route';

describe('admin economics API (S6-024)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({ user: { id: 'actor' } });
    mocks.getPlatformMargin.mockResolvedValue({
      revenueMicrounits: 100,
      costMicrounits: 10,
      grossMarginMicrounits: 90,
      marginBps: 9000,
      targetMarginBps: 9500,
      belowTarget: true,
    });
    mocks.getCurrentEconomicConfiguration.mockResolvedValue({
      providerCosts: [],
      exchangeRates: [],
    });
    mocks.createProviderCostRate.mockResolvedValue({ id: 'cost-version' });
    mocks.createTenantSellPrice.mockResolvedValue({ id: 'price-version' });
  });

  it('returns the weighted cockpit without changing commercial controls', async () => {
    const response = await getPlatform(new NextRequest('https://qalem.ma/api/admin/economics'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.margin).toMatchObject({ marginBps: 9000, belowTarget: true });
    expect(mocks.setMarginTarget).not.toHaveBeenCalled();
    expect(mocks.createTenantSellPrice).not.toHaveBeenCalled();
  });

  it('records a provider cost independently from tenant sell prices', async () => {
    const request = new NextRequest('https://qalem.ma/api/admin/economics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'providerCost',
        providerId: 'openai',
        modelId: 'gpt-value',
        billableUnit: 'llm_input_token',
        currency: 'USD',
        costAmount: '2.5',
        quantityBasis: '1000000',
        costSource: 'actual',
        provenance: 'Facture fournisseur',
        validFrom: '2026-09-01T00:00:00.000Z',
      }),
    });
    expect((await configurePlatform(request)).status).toBe(201);
    expect(mocks.createProviderCostRate).toHaveBeenCalledOnce();
    expect(mocks.createTenantSellPrice).not.toHaveBeenCalled();
  });

  it('records the tenant price explicitly from commercial value', async () => {
    const request = new NextRequest('https://qalem.ma/api/admin/tenants/tenant/economics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        billableUnit: 'llm_output_token',
        currency: 'MAD',
        priceAmount: '125',
        quantityBasis: '1000000',
        validFrom: '2026-09-01T00:00:00.000Z',
        commercialRationale: 'Valeur pédagogique livrée',
      }),
    });
    const response = await setTenantPrice(request, {
      params: Promise.resolve({ tenantId: 'tenant' }),
    });
    expect(response.status).toBe(201);
    expect(mocks.createTenantSellPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        priceAmount: '125',
        commercialRationale: 'Valeur pédagogique livrée',
      }),
    );
    expect(mocks.createProviderCostRate).not.toHaveBeenCalled();
  });

  it('blocks every economic mutation for a non-super-admin', async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    const request = new NextRequest('https://qalem.ma/api/admin/economics', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect((await configurePlatform(request)).status).toBe(403);
    expect(mocks.createProviderCostRate).not.toHaveBeenCalled();
  });
});
