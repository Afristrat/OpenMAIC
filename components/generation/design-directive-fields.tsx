'use client';

import { useState } from 'react';
import { Palette } from 'lucide-react';
import {
  DESIGN_DENSITIES,
  DESIGN_FONTS,
  DESIGN_HUE_FAMILIES,
  DESIGN_TONES,
  type DesignDirective,
} from '@openmaic/dsl';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  DESIGN_FORBIDDEN_MAX_ENTRIES as FORBIDDEN_MAX_ENTRIES,
  DESIGN_FORBIDDEN_MAX_LENGTH as FORBIDDEN_MAX_LENGTH,
  DESIGN_NOTES_MAX_LENGTH as NOTES_MAX_LENGTH,
} from '@/lib/branding/design-directive';
import { DesignPreview } from './design-preview';

const fieldClass =
  'w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-60';

function parseForbidden(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().slice(0, FORBIDDEN_MAX_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, FORBIDDEN_MAX_ENTRIES);
}

function SelectField<T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (option: T) => string;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The visual direction chosen at planning time, shown and editable before the author validates. */
export function DesignDirectiveFields({
  directive,
  onChange,
  disabled,
  designSystemEnabled,
  courseTitle,
  sampleTitle,
  samplePoints,
}: {
  directive: DesignDirective;
  onChange: (directive: DesignDirective) => void;
  disabled: boolean;
  /** False when the organization has not enabled the design system: edits would be ignored. */
  designSystemEnabled?: boolean;
  courseTitle: string;
  sampleTitle: string;
  samplePoints: string[];
}) {
  const { t } = useI18n();
  const [forbiddenText, setForbiddenText] = useState(directive.forbidden.join('\n'));

  return (
    <div className="space-y-4" data-testid="design-directive-fields">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Palette className="size-4 text-violet-500" aria-hidden />
          {t('generation.designTitle')}
        </div>
        <p className="text-xs text-muted-foreground">{t('generation.designDescription')}</p>
        {designSystemEnabled === false && (
          <p
            role="status"
            className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          >
            {t('generation.designDisabledNotice')}
          </p>
        )}
      </div>
      <DesignPreview
        directive={directive}
        courseTitle={courseTitle}
        sampleTitle={sampleTitle}
        samplePoints={samplePoints}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('generation.designTone')}
          value={directive.tone}
          options={DESIGN_TONES}
          optionLabel={(option) => t(`generation.designTone.${option}`)}
          onChange={(tone) => onChange({ ...directive, tone })}
          disabled={disabled}
        />
        <SelectField
          label={t('generation.designDensity')}
          value={directive.density}
          options={DESIGN_DENSITIES}
          optionLabel={(option) => t(`generation.designDensity.${option}`)}
          onChange={(density) => onChange({ ...directive, density })}
          disabled={disabled}
        />
        <SelectField
          label={t('generation.designHue')}
          value={directive.seed.hueFamily}
          options={DESIGN_HUE_FAMILIES}
          optionLabel={(option) => t(`generation.designHue.${option}`)}
          onChange={(hueFamily) =>
            onChange({ ...directive, seed: { ...directive.seed, hueFamily } })
          }
          disabled={disabled}
        />
        <SelectField
          label={t('generation.designChroma')}
          value={directive.seed.chromaLevel}
          options={['low', 'mid'] as const}
          optionLabel={(option) => t(`generation.designChroma.${option}`)}
          onChange={(chromaLevel) =>
            onChange({ ...directive, seed: { ...directive.seed, chromaLevel } })
          }
          disabled={disabled}
        />
        <SelectField
          label={t('generation.designHeadingFont')}
          value={directive.typography.heading}
          options={DESIGN_FONTS}
          optionLabel={(option) => option}
          onChange={(heading) =>
            onChange({ ...directive, typography: { ...directive.typography, heading } })
          }
          disabled={disabled}
        />
        <SelectField
          label={t('generation.designBodyFont')}
          value={directive.typography.body}
          options={DESIGN_FONTS}
          optionLabel={(option) => option}
          onChange={(body) =>
            onChange({ ...directive, typography: { ...directive.typography, body } })
          }
          disabled={disabled}
        />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('generation.designNotes', { max: NOTES_MAX_LENGTH })}
          </span>
          <textarea
            className={fieldClass}
            value={directive.notes}
            maxLength={NOTES_MAX_LENGTH}
            rows={7}
            onChange={(event) => onChange({ ...directive, notes: event.target.value })}
            disabled={disabled}
            aria-label={t('generation.designNotes', { max: NOTES_MAX_LENGTH })}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('generation.designForbidden', { max: FORBIDDEN_MAX_ENTRIES })}
          </span>
          <textarea
            className={fieldClass}
            value={forbiddenText}
            rows={7}
            onChange={(event) => {
              setForbiddenText(event.target.value);
              onChange({ ...directive, forbidden: parseForbidden(event.target.value) });
            }}
            disabled={disabled}
            aria-label={t('generation.designForbidden', { max: FORBIDDEN_MAX_ENTRIES })}
          />
        </label>
      </div>
    </div>
  );
}
