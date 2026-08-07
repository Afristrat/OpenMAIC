import type { LearningContext, Scene, Stage } from '@/lib/types/stage';
import { DEFAULT_LEARNING_CONTEXT, normalizeLearningContext } from './learning-context';

export type MarketAdaptationReason = 'currency' | 'territory';

export interface MarketAdaptationImpact {
  sceneId: string;
  order: number;
  title: string;
  sceneType: Scene['type'];
  reasons: MarketAdaptationReason[];
  automatable: boolean;
}

export interface MarketAdaptationPlan {
  source: LearningContext;
  target: LearningContext;
  hasChanges: boolean;
  impacts: MarketAdaptationImpact[];
}

const CURRENCY_TOKENS: Readonly<Record<string, readonly string[]>> = {
  MAD: ['MAD', 'د.م.', 'DH', 'DHS'],
  EUR: ['EUR', '€'],
  USD: ['USD', 'US$'],
  GBP: ['GBP', '£'],
  XOF: ['XOF', 'FCFA'],
  DZD: ['DZD', 'DA'],
  TND: ['TND', 'DT'],
};

function normalizedText(value: unknown): string {
  const parts: string[] = [];
  const visit = (candidate: unknown, key?: string) => {
    if (typeof candidate === 'string') {
      if (key === 'src' || candidate.startsWith('data:')) return;
      parts.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item));
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    Object.entries(candidate).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  return parts.join('\n').toLocaleLowerCase();
}

function includesToken(haystack: string, token: string): boolean {
  const normalizedToken = token.toLocaleLowerCase();
  if (!/^[a-z0-9]+$/i.test(token)) return haystack.includes(normalizedToken);
  const escaped = normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

function mentionsCurrency(text: string, currencyCode: string): boolean {
  return (CURRENCY_TOKENS[currencyCode] ?? [currencyCode]).some((token) =>
    includesToken(text, token),
  );
}

export function planMarketAdaptation(
  stage: Stage,
  scenes: readonly Scene[],
  rawTarget: LearningContext,
): MarketAdaptationPlan {
  const source = normalizeLearningContext(stage.learningContext ?? DEFAULT_LEARNING_CONTEXT);
  const target = normalizeLearningContext(rawTarget);
  if (!target.territory || !/^[A-Z]{3}$/.test(target.currencyCode)) {
    throw new Error('A territory and a three-letter ISO 4217 currency code are required');
  }

  const currencyChanged = source.currencyCode !== target.currencyCode;
  const territoryChanged =
    source.territory.toLocaleLowerCase() !== target.territory.toLocaleLowerCase();
  const hasChanges = currencyChanged || territoryChanged;
  if (!hasChanges) return { source, target, hasChanges, impacts: [] };

  const impacts = scenes.flatMap<MarketAdaptationImpact>((scene) => {
    const text = normalizedText(scene);
    const reasons: MarketAdaptationReason[] = [];
    if (currencyChanged && mentionsCurrency(text, source.currencyCode)) reasons.push('currency');
    if (
      territoryChanged &&
      source.territory &&
      text.includes(source.territory.toLocaleLowerCase())
    ) {
      reasons.push('territory');
    }
    if (reasons.length === 0) return [];
    return [
      {
        sceneId: scene.id,
        order: scene.order,
        title: scene.title,
        sceneType: scene.type,
        reasons,
        automatable: scene.type === 'slide',
      },
    ];
  });

  return { source, target, hasChanges, impacts };
}

export function buildMarketAdaptationInstruction(plan: MarketAdaptationPlan): string {
  const sceneIds = plan.impacts
    .filter((impact) => impact.automatable)
    .map((impact) => impact.sceneId)
    .join(', ');
  return [
    `Adapte uniquement les diapositives suivantes au territoire ${plan.target.territory} et à la devise ${plan.target.currencyCode} : ${sceneIds}.`,
    'Conserve leurs objectifs, leur ordre, leur structure pédagogique et les éléments sans rapport avec le marché.',
    `Adapte les exemples, contraintes, budgets, textes visibles et notes de présentation qui dépendent du ${plan.source.territory} ou de ${plan.source.currencyCode}.`,
    'Ne convertis aucun montant existant sans taux de change actuel et sourcé. Sans source suffisante, reformule le montant comme une hypothèse illustrative explicite dans la devise cible.',
    'N’utilise jamais de tiret cadratin.',
  ].join(' ');
}
