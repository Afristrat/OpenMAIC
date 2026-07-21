'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { qalemUiLocales, type Locale } from '@/lib/i18n';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Référentiel culturel du casting — liste validée par Amine (docs/foundation/2-vivre/02-data-dictionary.md) */
const CULTURE_OPTIONS = ['ma-ar', 'ma-fr', 'fr', 'en'] as const;
type Culture = (typeof CULTURE_OPTIONS)[number];

const PACE_OPTIONS = ['slow', 'normal', 'fast'] as const;
type Pace = (typeof PACE_OPTIONS)[number];

interface ProfilePreferences {
  pace?: Pace;
  humorOk?: boolean;
}

interface ProfileGetResponse {
  success: boolean;
  richProfileEnabled: boolean;
  culture?: string;
  uiLanguage?: string;
  preferences?: ProfilePreferences;
}

const DEFAULT_CULTURE: Culture = 'ma-fr';
const DEFAULT_UI_LANGUAGE: Locale = 'fr-FR';
const DEFAULT_PACE: Pace = 'normal';

function isCulture(value: string): value is Culture {
  return (CULTURE_OPTIONS as readonly string[]).includes(value);
}

function isPace(value: string): value is Pace {
  return (PACE_OPTIONS as readonly string[]).includes(value);
}

function isUiLanguage(value: string): value is Locale {
  return qalemUiLocales.some((l) => l.code === value);
}

/**
 * Section "profil enrichi" (culture, langue d'interface, préférences — S2-001).
 *
 * Gatée côté serveur par le flag `rich_profile` (lib/flags) : la visibilité
 * ne dépend PAS de `useAuth()` côté client (qui reste `null` en mode invité,
 * y compris dans l'environnement e2e où Supabase n'est jamais configuré —
 * voir e2e/tests/rich-profile.spec.ts) mais de la réponse de GET /api/profile,
 * qui applique `requireAuth` + `isFeatureEnabled('rich_profile')` côté
 * serveur. Section absente tant que le flag n'est pas activé ou que
 * l'utilisateur n'est pas authentifié (fail-closed, cohérent avec
 * isFeatureEnabled).
 */
export function RichProfileSection() {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  const [culture, setCulture] = useState<Culture>(DEFAULT_CULTURE);
  const [uiLanguage, setUiLanguage] = useState<Locale>(DEFAULT_UI_LANGUAGE);
  const [pace, setPace] = useState<Pace>(DEFAULT_PACE);
  const [humorOk, setHumorOk] = useState(false);

  const [initial, setInitial] = useState({
    culture: DEFAULT_CULTURE,
    uiLanguage: DEFAULT_UI_LANGUAGE,
    pace: DEFAULT_PACE,
    humorOk: false,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const data = (await res.json()) as ProfileGetResponse;
        if (cancelled) return;

        setEnabled(data.richProfileEnabled);
        if (data.richProfileEnabled) {
          const nextCulture =
            data.culture && isCulture(data.culture) ? data.culture : DEFAULT_CULTURE;
          const nextUiLanguage =
            data.uiLanguage && isUiLanguage(data.uiLanguage)
              ? data.uiLanguage
              : DEFAULT_UI_LANGUAGE;
          const nextPace =
            data.preferences?.pace && isPace(data.preferences.pace)
              ? data.preferences.pace
              : DEFAULT_PACE;
          const nextHumorOk = data.preferences?.humorOk ?? false;

          setCulture(nextCulture);
          setUiLanguage(nextUiLanguage);
          setPace(nextPace);
          setHumorOk(nextHumorOk);
          setInitial({
            culture: nextCulture,
            uiLanguage: nextUiLanguage,
            pace: nextPace,
            humorOk: nextHumorOk,
          });
        }
      } catch {
        if (!cancelled) setEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(
    () =>
      culture !== initial.culture ||
      uiLanguage !== initial.uiLanguage ||
      pace !== initial.pace ||
      humorOk !== initial.humorOk,
    [culture, uiLanguage, pace, humorOk, initial],
  );

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          culture,
          uiLanguage,
          preferences: { pace, humorOk },
        }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Error');
      }
      setInitial({ culture, uiLanguage, pace, humorOk });
      toast.success(t('profile.saved'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [isDirty, culture, uiLanguage, pace, humorOk, t]);

  if (loading || !enabled) return null;

  return (
    <section data-testid="rich-profile-section" className="space-y-6 pt-6 border-t border-border">
      <div>
        <h2 className="text-lg font-semibold">{t('profile.richProfile.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('profile.richProfile.description')}</p>
      </div>

      {/* Culture — référentiel casting */}
      <div className="space-y-2">
        <Label htmlFor="rich-profile-culture" className="text-sm font-medium">
          {t('profile.richProfile.cultureLabel')}
        </Label>
        <Select
          value={culture}
          onValueChange={(value) => {
            if (isCulture(value)) setCulture(value);
          }}
        >
          <SelectTrigger
            id="rich-profile-culture"
            data-testid="culture-select"
            className="max-w-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CULTURE_OPTIONS.map((code) => (
              <SelectItem key={code} value={code} data-testid={`culture-option-${code}`}>
                {t(`profile.richProfile.culture.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground max-w-sm">
          {t('profile.richProfile.cultureHint')}
        </p>
      </div>

      {/* Langue d'interface */}
      <div className="space-y-2">
        <Label htmlFor="rich-profile-ui-language" className="text-sm font-medium">
          {t('profile.richProfile.uiLanguageLabel')}
        </Label>
        <Select
          value={uiLanguage}
          onValueChange={(value) => {
            if (isUiLanguage(value)) setUiLanguage(value);
          }}
        >
          <SelectTrigger
            id="rich-profile-ui-language"
            data-testid="ui-language-select"
            className="max-w-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {qalemUiLocales.map((l) => (
              <SelectItem key={l.code} value={l.code} data-testid={`ui-language-option-${l.code}`}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Préférences d'expérience */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('profile.richProfile.preferencesLabel')}</Label>

        <div className="space-y-2">
          <Label htmlFor="rich-profile-pace" className="text-xs text-muted-foreground">
            {t('profile.richProfile.paceLabel')}
          </Label>
          <Select
            value={pace}
            onValueChange={(value) => {
              if (isPace(value)) setPace(value);
            }}
          >
            <SelectTrigger id="rich-profile-pace" data-testid="pace-select" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PACE_OPTIONS.map((code) => (
                <SelectItem key={code} value={code} data-testid={`pace-option-${code}`}>
                  {t(`profile.richProfile.pace.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="rich-profile-humor"
            data-testid="humor-checkbox"
            checked={humorOk}
            onCheckedChange={(checked) => setHumorOk(checked === true)}
          />
          <Label htmlFor="rich-profile-humor" className="text-sm font-normal cursor-pointer">
            {t('profile.richProfile.humorLabel')}
          </Label>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={!isDirty || saving}
        data-testid="rich-profile-save"
        className={cn(
          'gap-2 min-w-[160px] transition-colors',
          isDirty
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground cursor-not-allowed',
        )}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isDirty ? (
          <Save className="size-4" />
        ) : (
          <Check className="size-4" />
        )}
        {isDirty ? t('profile.save') : t('profile.noChanges')}
      </Button>
    </section>
  );
}
