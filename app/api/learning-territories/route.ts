import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminOrOrgAuthor, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { currencyForTerritory, isIso4217CurrencyCode } from '@/lib/formation-engine/learning-context';

const bodySchema = z.object({
  orgId: z.string().uuid(),
  countryName: z.string().trim().min(2).max(120),
  currencyCode: z.string().trim().length(3).optional(),
});

function normalizeCountryName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

async function resolveCountry(countryName: string): Promise<{ currencyCode: string; languageCode?: string }> {
  const knownCurrency = currencyForTerritory(countryName);
  if (knownCurrency) return { currencyCode: knownCurrency };
  const response = await fetch(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true&fields=currencies,languages`,
    { signal: AbortSignal.timeout(5000), cache: 'no-store' },
  );
  if (!response.ok) throw new Error('COUNTRY_NOT_FOUND');
  const countries = (await response.json()) as Array<{
    currencies?: Record<string, unknown>;
    languages?: Record<string, string>;
  }>;
  const country = countries[0];
  const currencyCode = Object.keys(country?.currencies ?? {})[0];
  if (!currencyCode || !isIso4217CurrencyCode(currencyCode)) throw new Error('CURRENCY_NOT_FOUND');
  return { currencyCode, languageCode: Object.keys(country?.languages ?? {})[0] };
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
  const auth = await requireSuperAdminOrOrgMember(request, orgId);
  if (auth.response) return auth.response;
  const { data, error } = await createServiceSupabaseClient()
    .from('organization_learning_territories')
    .select('country_name,currency_code,language_code')
    .eq('org_id', orgId)
    .order('country_name');
  if (error) return NextResponse.json({ error: 'Failed to load territories' }, { status: 500 });
  return NextResponse.json({ success: true, territories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid territory' }, { status: 400 });
  const auth = await requireSuperAdminOrOrgAuthor(request, parsed.data.orgId);
  if (auth.response) return auth.response;
  let resolved: { currencyCode: string; languageCode?: string };
  try {
    resolved = parsed.data.currencyCode
      ? { currencyCode: parsed.data.currencyCode.toUpperCase() }
      : await resolveCountry(parsed.data.countryName);
  } catch {
    return NextResponse.json({ error: 'Country or currency could not be resolved' }, { status: 422 });
  }
  if (!isIso4217CurrencyCode(resolved.currencyCode))
    return NextResponse.json({ error: 'Invalid ISO 4217 currency' }, { status: 422 });
  const row = {
    org_id: parsed.data.orgId,
    country_name: parsed.data.countryName,
    country_name_normalized: normalizeCountryName(parsed.data.countryName),
    currency_code: resolved.currencyCode,
    language_code: resolved.languageCode ?? null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await createServiceSupabaseClient()
    .from('organization_learning_territories')
    .upsert(row, { onConflict: 'org_id,country_name_normalized' })
    .select('country_name,currency_code,language_code')
    .single();
  if (error) return NextResponse.json({ error: 'Failed to save territory' }, { status: 500 });
  return NextResponse.json({ success: true, territory: data }, { status: 201 });
}
