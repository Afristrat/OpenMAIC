/**
 * Types du contrat P1-B — interface Mishkāt/Hyperframes (studio vidéo souverain
 * externe, déployé sur https://mishkat.ai-mpower.com, cf. `MISHKAT-*` docs du
 * repo tiers, lues en lecture seule). Interface fichiers/API uniquement :
 * aucun import de code depuis le repo mishkat, seulement ces types + le client
 * HTTP (`hyperframes-client.ts`).
 *
 * Aligné sur `schemas/brief.schema.json` du HEAD Mishkāt. Les unions fermées
 * empêchent Qalem d'envoyer une valeur que le studio refuserait au rendu.
 */

export const HYPERFRAMES_AUDIENCES = [
  'etudiant',
  'institution',
  'investisseur',
  'grand_public',
  'pairs_tech',
  'interne',
] as const;
export type HyperframesAudience = (typeof HYPERFRAMES_AUDIENCES)[number];
export type HyperframesChannel =
  | 'linkedin'
  | 'reels'
  | 'tiktok'
  | 'whatsapp_status'
  | 'youtube'
  | 'presentation'
  | 'instagram_feed';
export type HyperframesAspect = '16:9' | '9:16' | '1:1';
export type HyperframesLanguageCode = 'fr' | 'ar' | 'darija' | 'en';
export const HYPERFRAMES_TONES = [
  'premium',
  'insolent',
  'cinematic',
  'pedagogique',
  'urgence',
  'default',
] as const;
export type HyperframesTone = (typeof HYPERFRAMES_TONES)[number];
export const HYPERFRAMES_OBJECTIVES = [
  'awareness',
  'acquisition',
  'proof',
  'wrapped_shareable',
  'demo_day',
] as const;
export type HyperframesObjective = (typeof HYPERFRAMES_OBJECTIVES)[number];

export interface HyperframesChannelFormat {
  channel: HyperframesChannel;
  aspect: HyperframesAspect;
}

export interface HyperframesLanguage {
  primary: HyperframesLanguageCode;
  secondary?: HyperframesLanguageCode;
  rtl?: boolean;
}

export interface HyperframesSound {
  music?: boolean;
  voiceover?: boolean;
  captions_burned?: boolean;
}

export interface HyperframesBrief {
  brand_id: string;
  intent: string;
  audience: HyperframesAudience;
  channel_format: HyperframesChannelFormat[];
  language: HyperframesLanguage;
  tone: HyperframesTone;
  duration_s: number; // 10-180
  objective: HyperframesObjective;
  proof?: string;
  sound?: HyperframesSound;
}

export interface HyperframesBrandMedia {
  backgrounds?: string[];
}

/** Sous-ensemble minimal de BrandTokens réellement utile côté Qalem (fonds image). */
export interface HyperframesBrandTokens {
  media?: HyperframesBrandMedia;
  [key: string]: unknown;
}

export type HyperframesProductionStatus = 'queued' | 'generating' | 'rendering' | 'done' | 'error';

export interface HyperframesVariant {
  lang: string;
  format: string;
  gatePassed: boolean;
  url: string;
}

export interface HyperframesProduction {
  id: string;
  status: HyperframesProductionStatus;
  storyboard?: unknown;
  variants?: HyperframesVariant[];
  error?: string;
}

export interface HyperframesCreateProductionResponse {
  id: string;
  status: HyperframesProductionStatus;
}
