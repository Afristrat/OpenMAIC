import type { LearningContext } from '@/lib/types/stage';

export const DEFAULT_LEARNING_CONTEXT: LearningContext = {
  territory: 'Maroc',
  currencyCode: 'MAD',
};

export const COMMON_LEARNING_CURRENCIES = [
  'MAD',
  'XOF',
  'DZD',
  'TND',
  'EGP',
  'NGN',
  'GHS',
  'KES',
  'ZAR',
  'EUR',
  'USD',
  'GBP',
  'AED',
  'SAR',
] as const;

const ISO_4217_CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));

export function isIso4217CurrencyCode(value: string): boolean {
  return ISO_4217_CURRENCY_CODES.has(value.trim().toUpperCase());
}

export function normalizeLearningContext(value: LearningContext): LearningContext {
  return {
    territory: value.territory.trim(),
    currencyCode: value.currencyCode.trim().toUpperCase(),
  };
}

export function buildLearningContextDirective(
  rawContext: LearningContext,
  locale: 'fr-FR' | 'ar-MA' | 'en-US' = 'fr-FR',
): string {
  const context = normalizeLearningContext(rawContext);
  if (!context.territory || !isIso4217CurrencyCode(context.currencyCode)) {
    throw new Error('A territory and a three-letter ISO 4217 currency code are required');
  }

  if (locale === 'ar-MA') {
    return [
      'سياق الاستخدام الإلزامي:',
      `البلد أو الإقليم: ${context.territory}.`,
      `العملة المرجعية: ${context.currencyCode}.`,
      `استخدم ${context.currencyCode} في جميع المبالغ والميزانيات والأمثلة والتمارين. لا تستخدم عملة أخرى إلا في مقارنة موضحة صراحة. لا تحوّل مبلغًا قائماً دون سعر صرف حديث ومصدر موثوق.`,
    ].join('\n');
  }

  if (locale === 'en-US') {
    return [
      'MANDATORY USAGE CONTEXT:',
      `Country or territory: ${context.territory}.`,
      `Reference currency: ${context.currencyCode}.`,
      `Use ${context.currencyCode} for every amount, budget, example and exercise. Use another currency only in an explicitly labelled comparison. Never convert an existing amount without a current, sourced exchange rate.`,
    ].join('\n');
  }

  return [
    'CONTEXTE D’USAGE OBLIGATOIRE :',
    `Pays ou territoire : ${context.territory}.`,
    `Code ISO 4217 interne de la devise de référence : ${context.currencyCode}.`,
    context.currencyCode === 'MAD'
      ? 'Dans tous les textes pédagogiques destinés à l’apprenant, écrire « dirham » pour un montant exactement égal à 1 et « dirhams » dans les autres cas ; ne jamais afficher le code MAD à la place du nom de la devise.'
      : `Utiliser ${context.currencyCode} pour tous les montants, budgets, exemples et exercices.`,
    'N’utiliser une autre devise que dans une comparaison explicitement signalée. Ne jamais convertir un montant existant sans taux de change actuel et sourcé.',
  ].join('\n');
}
