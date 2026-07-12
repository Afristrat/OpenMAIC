/**
 * Types du contrat P1-B — interface Mishkāt/Hyperframes (studio vidéo souverain
 * externe, déployé sur https://mishkat.ai-mpower.com, cf. `MISHKAT-*` docs du
 * repo tiers, lues en lecture seule). Interface fichiers/API uniquement :
 * aucun import de code depuis le repo mishkat, seulement ces types + le client
 * HTTP (`hyperframes-client.ts`).
 *
 * Les champs `audience`, `tone`, `objective` et `channel_format[].channel` sont
 * documentés comme des enums côté Mishkāt mais leurs valeurs closes ne sont pas
 * publiées dans l'interface — typés `string` plutôt que fabriqués, Mishkāt
 * valide et renvoie `status: "error"` si la valeur est invalide.
 */

export interface HyperframesChannelFormat {
  channel: string;
  aspect: string; // ex. "16:9", "9:16"
}

export interface HyperframesLanguage {
  primary: string; // code langue court, ex. "fr", "ar", "en"
  secondary?: string;
}

export interface HyperframesSound {
  music?: boolean;
  voiceover?: boolean;
  captions_burned?: boolean;
}

export interface HyperframesBrief {
  brand_id: string;
  intent: string;
  audience: string;
  channel_format: HyperframesChannelFormat[];
  language: HyperframesLanguage;
  tone: string;
  duration_s: number; // 10-180
  objective: string;
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
