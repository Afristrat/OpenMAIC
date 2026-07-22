import i18n from 'i18next';
import baseChinese from './locales/zh-CN.json';
import uiArabic from './locales/ui-ar-MA.json';
import uiEnglish from './locales/ui-en-US.json';
import uiFrench from './locales/ui-fr-FR.json';
import { defaultLocale } from './types';

function flattenResource(
  value: Record<string, unknown>,
  prefix = '',
  output: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenResource(child as Record<string, unknown>, path, output);
    } else {
      output[path] = child;
    }
  }
  return output;
}

const chinese = flattenResource(baseChinese);

const resources = {
  'en-US': { translation: uiEnglish },
  'fr-FR': { translation: uiFrench },
  'ar-MA': { translation: uiArabic },
  'zh-CN': { translation: chinese },
};

void i18n.init({
  lng: defaultLocale,
  fallbackLng: 'en-US',
  supportedLngs: Object.keys(resources),
  resources,
  keySeparator: false,
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
