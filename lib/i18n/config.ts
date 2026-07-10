import i18n from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

/**
 * Legacy i18next instance inherited from upstream v0.3.0's own i18n rewrite.
 * Qalem's canonical app-wide i18n lives in lib/i18n/index.ts (translate() /
 * getClientTranslation(), native FR/AR/EN content, consumed via
 * lib/hooks/use-i18n.tsx). This instance is kept only as a fallback source
 * for UI namespaces upstream ships that Qalem hasn't ported yet — currently
 * just `pbl.v2.*` (PBL v2 workspace) — see lib/i18n/index.ts and
 * .ralph/progress.md Known Issues.
 *
 * Resource coverage is intentionally limited to what has real content:
 * en-US (upstream original) and ar-MA (reusing upstream's ar-SA MSA
 * translation verbatim, see lib/i18n/locales/ar-MA.json). There is no
 * fr-FR resource — French falls back to English for this namespace only.
 */
i18n.use(resourcesToBackend((language: string) => import(`./locales/${language}.json`))).init({
  lng: 'en-US',
  fallbackLng: 'en-US',
  supportedLngs: ['en-US', 'ar-MA'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
