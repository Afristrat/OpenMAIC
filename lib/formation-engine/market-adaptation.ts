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
    const reasons: MarketAdaptationReason[] = [];
    // Market assumptions may be implicit in examples, constraints, imagery,
    // narration, or missing metadata. A changed market therefore affects every
    // scene, not only scenes where a token scan finds the old context.
    if (currencyChanged) reasons.push('currency');
    if (territoryChanged) reasons.push('territory');
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
    ...(plan.target.currencyCode === 'MAD'
      ? [
          'Conserve MAD comme code ISO 4217 interne, mais écris « dirham » au singulier et « dirhams » au pluriel dans tout texte français visible ou narré destiné à l’apprenant.',
        ]
      : []),
    'Ne convertis aucun montant existant sans taux de change actuel et sourcé. Sans source suffisante, reformule le montant comme une hypothèse illustrative explicite dans la devise cible.',
    'N’utilise jamais de tiret cadratin.',
  ].join(' ');
}
