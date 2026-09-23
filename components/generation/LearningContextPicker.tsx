'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AFRICAN_COUNTRIES,
  COMMON_LEARNING_CURRENCIES,
  currencyForTerritory,
} from '@/lib/formation-engine/learning-context';
import type { LearningContext } from '@/lib/types/stage';

type StoredTerritory = {
  country_name: string;
  currency_code: string;
  language_code: string | null;
};

interface Props {
  orgId?: string;
  locale: string;
  value: LearningContext;
  onChange: (value: LearningContext) => void;
  territoryLabel: string;
  currencyLabel: string;
  searchPlaceholder: string;
  addCountryLabel: string;
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

const subscribeToHydration = () => () => undefined;

export function LearningContextPicker({
  orgId,
  locale,
  value,
  onChange,
  territoryLabel,
  currencyLabel,
  searchPlaceholder,
  addCountryLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredTerritory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    void fetch(`/api/learning-territories?orgId=${encodeURIComponent(orgId)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setStored(payload?.territories ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [orgId]);

  const countries = useMemo(() => {
    const entries = new Map<string, { country: string; currency: string }>(
      AFRICAN_COUNTRIES.map(([country, currency]) => [normalized(country), { country, currency }]),
    );
    for (const item of stored)
      entries.set(normalized(item.country_name), {
        country: item.country_name,
        currency: item.currency_code,
      });
    return [...entries.values()].sort((a, b) => a.country.localeCompare(b.country, locale));
  }, [locale, stored]);

  const filtered = countries.filter(({ country }) =>
    normalized(country).includes(normalized(value.territory)),
  );
  const exact = countries.find(
    ({ country }) => normalized(country) === normalized(value.territory),
  );
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const currencyNames = useMemo(() => {
    if (!hydrated) return null;
    try {
      return new Intl.DisplayNames([locale], { type: 'currency' });
    } catch {
      return null;
    }
  }, [hydrated, locale]);

  const selectCountry = (country: string, currency: string) => {
    onChange({ territory: country, currencyCode: currency });
    setOpen(false);
  };

  const saveUnknownCountry = async () => {
    if (!orgId || value.territory.trim().length < 2 || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/learning-territories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, countryName: value.territory.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.territory) return;
      const territory = payload.territory as StoredTerritory;
      setStored((previous) => [
        ...previous.filter(
          (item) => normalized(item.country_name) !== normalized(territory.country_name),
        ),
        territory,
      ]);
      selectCountry(territory.country_name, territory.currency_code);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {territoryLabel}
        <input
          data-testid="learning-territory"
          value={value.territory}
          placeholder={searchPlaceholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            const territory = event.target.value;
            onChange({
              ...value,
              territory,
              currencyCode: currencyForTerritory(territory) ?? value.currencyCode,
            });
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (exact) selectCountry(exact.country, exact.currency);
            else void saveUnknownCountry();
          }}
          className="h-8 w-52 rounded-md border border-border bg-background px-2 text-foreground"
          role="combobox"
          aria-expanded={open}
          aria-controls="learning-territory-options"
        />
        {open && (
          <div
            id="learning-territory-options"
            className="absolute left-0 top-9 z-50 max-h-64 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          >
            {filtered.map(({ country, currency }) => (
              <button
                key={country}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCountry(country, currency)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-accent"
              >
                <span>{country}</span>
                <span className="text-muted-foreground">{currency}</span>
              </button>
            ))}
            {!exact && value.territory.trim().length >= 2 && (
              <button
                type="button"
                disabled={saving}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void saveUnknownCountry()}
                className="w-full rounded-md px-2 py-2 text-left font-medium text-primary hover:bg-accent disabled:opacity-50"
              >
                {addCountryLabel}: {value.territory.trim()}
              </button>
            )}
          </div>
        )}
      </label>
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {currencyLabel}
        <select
          data-testid="learning-currency"
          value={value.currencyCode}
          onChange={(event) => onChange({ ...value, currencyCode: event.target.value })}
          className="h-8 min-w-52 rounded-md border border-border bg-background px-2 text-foreground"
        >
          {[
            ...new Set([
              ...COMMON_LEARNING_CURRENCIES,
              ...AFRICAN_COUNTRIES.map(([, currency]) => currency),
              ...stored.map((item) => item.currency_code),
            ]),
          ]
            .sort()
            .map((currency) => (
              <option key={currency} value={currency}>
                {currency} · {currencyNames?.of(currency) ?? currency}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
