/**
 * Construit le brief JSON (contrat P1-B) attendu par Mishkāt à partir d'une
 * scène Qalem. Les champs sémantiques (audience/tone/objective) ne sont pas
 * dérivés automatiquement du contenu de la scène — leurs valeurs closes ne
 * sont pas publiées côté Mishkāt (cf. hyperframes-types.ts), donc laissés à
 * la main de l'appelant plutôt que devinés.
 */

import type { Locale } from '@/lib/i18n/types';
import type { HyperframesBrief, HyperframesChannelFormat } from './hyperframes-types';

/** Mappe une locale Qalem vers le code langue court attendu par Mishkāt. */
export function localeToHyperframesLanguage(locale: Locale): string {
  const map: Record<Locale, string> = {
    'fr-FR': 'fr',
    'ar-MA': 'ar',
    'en-US': 'en',
    'zh-CN': 'zh',
  };
  return map[locale];
}

export interface BuildHyperframesBriefParams {
  stageName: string;
  sceneTitle: string;
  locale: Locale;
  audience: string;
  tone: string;
  objective: string;
  durationS: number;
  channelFormat?: HyperframesChannelFormat[];
  notes?: string;
}

const MIN_DURATION_S = 10;
const MAX_DURATION_S = 180;

export function buildHyperframesBrief(params: BuildHyperframesBriefParams): HyperframesBrief {
  const brandId = process.env.MISHKAT_BRAND_ID;
  if (!brandId) {
    throw new Error('MISHKAT_BRAND_ID non configurée — capsule vidéo indisponible');
  }

  const intent = params.notes
    ? `${params.stageName} — ${params.sceneTitle}. ${params.notes}`
    : `${params.stageName} — ${params.sceneTitle}`;

  const durationS = Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, Math.round(params.durationS)));

  return {
    brand_id: brandId,
    intent,
    audience: params.audience,
    channel_format: params.channelFormat ?? [{ channel: 'classroom', aspect: '16:9' }],
    language: { primary: localeToHyperframesLanguage(params.locale) },
    tone: params.tone,
    duration_s: durationS,
    objective: params.objective,
    sound: { captions_burned: true },
  };
}
