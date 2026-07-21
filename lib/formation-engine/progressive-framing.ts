import type { QalemCapability } from '@/lib/ai/capability-registry';

export type FramingLocale = 'fr-FR' | 'ar-MA' | 'en-US';

export type FramingFieldId =
  | 'transformation.problem'
  | 'transformation.targetPerformance'
  | 'audience.experience'
  | 'audience.language'
  | 'audience.accessibility'
  | 'audience.culturalContext'
  | 'delivery.duration'
  | 'delivery.groupSize'
  | 'delivery.infrastructure'
  | 'assessment.successEvidence'
  | 'content.authorizedSources'
  | 'operation.confidentiality';

export type FramingObservation =
  | {
      field: FramingFieldId;
      origin: 'explicit';
      value: unknown;
      evidence?: string;
    }
  | {
      field: FramingFieldId;
      origin: 'inferred';
      value: unknown;
      evidence: string;
      confidence: number;
    };

export interface FramingContext {
  locale: FramingLocale;
  requestedCapabilities: QalemCapability[];
  highStakes?: boolean;
  sourceMaterialProvided?: boolean;
  externalSharing?: boolean;
  synchronous?: boolean;
  inferenceThreshold?: number;
}

export interface FramingAssumption {
  field: FramingFieldId;
  value: unknown;
  evidence: string;
  confidence: number;
}

export interface FramingQuestion {
  field: FramingFieldId;
  question: string;
  changes: string[];
}

export interface ProgressiveFramingResult {
  contract: Partial<Record<FramingFieldId, unknown>>;
  assumptions: FramingAssumption[];
  blockingQuestions: FramingQuestion[];
  unknownNonBlocking: FramingFieldId[];
}

interface FieldDefinition {
  changes: string[];
  blocks: (context: FramingContext) => boolean;
  questions: Record<FramingLocale, string>;
}

const ALWAYS = () => true;
const NEVER = () => false;
const MEDIA_CAPABILITIES = new Set<QalemCapability>([
  'vision',
  'image-generation',
  'image-editing',
  'video-generation',
  'music-generation',
  'speech-generation',
  'transcription',
]);

const FIELD_DEFINITIONS: Record<FramingFieldId, FieldDefinition> = {
  'transformation.problem': {
    changes: ['objectif', 'priorisation'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Quel problème observable cette formation doit-elle résoudre ?',
      'ar-MA': 'ما المشكلة القابلة للملاحظة التي يجب أن يعالجها هذا التكوين؟',
      'en-US': 'What observable problem must this training solve?',
    },
  },
  'transformation.targetPerformance': {
    changes: ['objectif mesurable', 'activité', 'évaluation'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Que devront savoir faire les participants en situation réelle ?',
      'ar-MA': 'ماذا يجب أن يتمكن المشاركون من إنجازه في وضعية حقيقية؟',
      'en-US': 'What must participants be able to do in a real situation?',
    },
  },
  'audience.experience': {
    changes: ['niveau', 'charge cognitive', 'exemples'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Quelle expérience les participants possèdent-ils déjà sur ce sujet ?',
      'ar-MA': 'ما الخبرة التي يمتلكها المشاركون مسبقاً في هذا الموضوع؟',
      'en-US': 'What prior experience do participants already have with this topic?',
    },
  },
  'audience.language': {
    changes: ['langue', 'terminologie', 'voix'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Dans quelle langue les participants doivent-ils apprendre et interagir ?',
      'ar-MA': 'بأي لغة يجب أن يتعلم المشاركون ويتفاعلوا؟',
      'en-US': 'Which language should participants use to learn and interact?',
    },
  },
  'audience.accessibility': {
    changes: ['média', 'interaction', 'alternative accessible'],
    blocks: (context) =>
      context.requestedCapabilities.some((capability) => MEDIA_CAPABILITIES.has(capability)),
    questions: {
      'fr-FR':
        'Quelles contraintes d’accessibilité doivent guider les médias et les interactions ?',
      'ar-MA': 'ما متطلبات الولوج التي يجب أن توجه الوسائط والتفاعلات؟',
      'en-US': 'Which accessibility needs must shape media and interactions?',
    },
  },
  'audience.culturalContext': {
    changes: ['exemples', 'cas', 'registre'],
    blocks: NEVER,
    questions: {
      'fr-FR': 'Quel contexte culturel ou géographique faut-il privilégier ?',
      'ar-MA': 'ما السياق الثقافي أو الجغرافي الذي ينبغي إعطاؤه الأولوية؟',
      'en-US': 'Which cultural or geographic context should be prioritized?',
    },
  },
  'delivery.duration': {
    changes: ['périmètre', 'séquençage', 'profondeur'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Quel temps réel les participants peuvent-ils consacrer à cette formation ?',
      'ar-MA': 'ما المدة الفعلية التي يمكن للمشاركين تخصيصها لهذا التكوين؟',
      'en-US': 'How much real time can participants devote to this training?',
    },
  },
  'delivery.groupSize': {
    changes: ['interaction', 'facilitation', 'évaluation'],
    blocks: (context) => context.synchronous === true,
    questions: {
      'fr-FR': 'Combien de participants seront présents simultanément ?',
      'ar-MA': 'كم عدد المشاركين الذين سيكونون حاضرين في الوقت نفسه؟',
      'en-US': 'How many participants will attend at the same time?',
    },
  },
  'delivery.infrastructure': {
    changes: ['média', 'outil', 'repli'],
    blocks: (context) =>
      context.requestedCapabilities.some((capability) => MEDIA_CAPABILITIES.has(capability)),
    questions: {
      'fr-FR': 'Quelles contraintes d’équipement, de connexion ou d’outils faut-il respecter ?',
      'ar-MA': 'ما قيود التجهيز أو الاتصال أو الأدوات التي يجب احترامها؟',
      'en-US': 'Which equipment, connectivity, or tool constraints must be respected?',
    },
  },
  'assessment.successEvidence': {
    changes: ['évaluation', 'seuil', 'preuve d’impact'],
    blocks: ALWAYS,
    questions: {
      'fr-FR': 'Quelle preuve observable démontrera que la compétence est réellement acquise ?',
      'ar-MA': 'ما الدليل القابل للملاحظة الذي سيثبت اكتساب الكفاءة فعلياً؟',
      'en-US': 'What observable evidence will prove that the capability was acquired?',
    },
  },
  'content.authorizedSources': {
    changes: ['fiabilité', 'fraîcheur', 'conformité'],
    blocks: (context) => context.highStakes === true || context.sourceMaterialProvided === true,
    questions: {
      'fr-FR': 'Quelles sources sont autorisées et lesquelles doivent être exclues ?',
      'ar-MA': 'ما المصادر المسموح بها وما المصادر التي يجب استبعادها؟',
      'en-US': 'Which sources are authorized, and which must be excluded?',
    },
  },
  'operation.confidentiality': {
    changes: ['source', 'modèle', 'diffusion', 'rétention'],
    blocks: (context) =>
      context.externalSharing === true || context.sourceMaterialProvided === true,
    questions: {
      'fr-FR': 'Quelles règles de confidentialité et de diffusion s’appliquent aux contenus ?',
      'ar-MA': 'ما قواعد السرية والنشر المطبقة على المحتوى؟',
      'en-US': 'Which confidentiality and sharing rules apply to the content?',
    },
  },
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function validateContext(context: FramingContext): number {
  const threshold = context.inferenceThreshold ?? 0.75;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('inferenceThreshold must be between 0 and 1');
  }
  return threshold;
}

function validateObservation(observation: FramingObservation): void {
  if (!hasValue(observation.value)) return;
  if (observation.origin === 'inferred') {
    if (!observation.evidence.trim()) throw new Error(`Missing evidence for ${observation.field}`);
    if (
      !Number.isFinite(observation.confidence) ||
      observation.confidence < 0 ||
      observation.confidence > 1
    ) {
      throw new Error(`Invalid confidence for ${observation.field}`);
    }
  }
}

function bestObservation(observations: FramingObservation[]): FramingObservation | undefined {
  const withValues = observations.filter((observation) => hasValue(observation.value));
  return withValues.sort((left, right) => {
    if (left.origin !== right.origin) return left.origin === 'explicit' ? -1 : 1;
    const leftConfidence = left.origin === 'explicit' ? 1 : left.confidence;
    const rightConfidence = right.origin === 'explicit' ? 1 : right.confidence;
    return rightConfidence - leftConfidence;
  })[0];
}

export function buildProgressiveFraming(
  observations: FramingObservation[],
  context: FramingContext,
): ProgressiveFramingResult {
  const threshold = validateContext(context);
  observations.forEach(validateObservation);

  const contract: Partial<Record<FramingFieldId, unknown>> = {};
  const assumptions: FramingAssumption[] = [];
  const blockingQuestions: FramingQuestion[] = [];
  const unknownNonBlocking: FramingFieldId[] = [];

  for (const [field, definition] of Object.entries(FIELD_DEFINITIONS) as Array<
    [FramingFieldId, FieldDefinition]
  >) {
    const observation = bestObservation(
      observations.filter((candidate) => candidate.field === field),
    );
    if (observation?.origin === 'explicit') {
      contract[field] = observation.value;
      continue;
    }
    if (observation?.origin === 'inferred' && observation.confidence >= threshold) {
      contract[field] = observation.value;
      assumptions.push({
        field,
        value: observation.value,
        evidence: observation.evidence,
        confidence: observation.confidence,
      });
      continue;
    }
    if (definition.blocks(context)) {
      blockingQuestions.push({
        field,
        question: definition.questions[context.locale],
        changes: [...definition.changes],
      });
    } else {
      unknownNonBlocking.push(field);
    }
  }

  return { contract, assumptions, blockingQuestions, unknownNonBlocking };
}
