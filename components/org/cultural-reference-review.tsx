'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  CULTURE_REFERENCES,
  CULTURE_REFERENCE_VERSION,
  type CultureReferenceCode,
} from '@/lib/agents/culture-references';
import type { LearningDesignSettings } from '@/lib/agents/persona-catalog';
import { Button } from '@/components/ui/button';

interface CulturalReferenceReviewProps {
  orgId: string;
  value: LearningDesignSettings;
  onChange: (value: LearningDesignSettings) => void;
  t: (key: string) => string;
}

export function CulturalReferenceReview({
  orgId,
  value,
  onChange,
  t,
}: CulturalReferenceReviewProps): React.ReactElement {
  const [saving, setSaving] = useState<CultureReferenceCode | null>(null);

  const approve = async (culture: CultureReferenceCode) => {
    setSaving(culture);
    try {
      const response = await fetch(`/api/organizations/${orgId}/culture-references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ culture, version: CULTURE_REFERENCE_VERSION }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: {
          approval?: LearningDesignSettings['cultureReferenceApprovals'][CultureReferenceCode];
        };
      };
      if (!response.ok || !payload.success || !payload.data?.approval) return;
      onChange({
        ...value,
        cultureReferenceApprovals: {
          ...value.cultureReferenceApprovals,
          [culture]: payload.data.approval,
        },
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="sm:col-span-2 border-t pt-6" data-testid="cultural-reference-review">
      <h2 className="text-lg font-semibold">{t('org.culturalReferences.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {t('org.culturalReferences.description')}
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {CULTURE_REFERENCES.map((reference) => {
          const approved =
            value.cultureReferenceApprovals[reference.code]?.version === CULTURE_REFERENCE_VERSION;
          const maleNames = reference.names.filter((name) => name.gender === 'male');
          const femaleNames = reference.names.filter((name) => name.gender === 'female');
          return (
            <article key={reference.code} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t(`org.culturalReferences.${reference.code}`)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('org.culturalReferences.version')} {CULTURE_REFERENCE_VERSION}
                  </p>
                </div>
                {approved && (
                  <Check
                    className="size-5 text-emerald-600"
                    aria-label={t('org.culturalReferences.approved')}
                  />
                )}
              </div>
              <NameGroup label={t('org.genders.male')} names={maleNames} />
              <NameGroup label={t('org.genders.female')} names={femaleNames} />
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={approved || saving === reference.code}
                onClick={() => void approve(reference.code)}
              >
                {saving === reference.code ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : approved ? (
                  t('org.culturalReferences.approved')
                ) : (
                  t('org.culturalReferences.approve')
                )}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NameGroup({
  label,
  names,
}: {
  label: string;
  names: readonly { display: string; romanized?: string }[];
}): React.ReactElement {
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span key={name.display} className="rounded-full bg-muted px-2 py-1 text-xs">
            {name.display}
            {name.romanized ? ` · ${name.romanized}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
