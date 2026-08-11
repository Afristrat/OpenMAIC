import type {
  ClassroomPlan,
  ResourceGenerationRequest,
  SceneOutline,
} from '@/lib/types/generation';

const WORKBOOK_WORDS = /\b(?:classeur|excel|xlsx|workbook|spreadsheet)\b/i;
const WORKBOOK_ACTIONS =
  /\b(?:cr[ée]e?r?|g[ée]n[èe]re?r?|produi(?:s|re)|t[ée]l[ée]charg(?:er|ement)|modifiable|utilisable|fichier r[ée]el|v[ée]ritable)\b/i;
const CASH_FLOW_13_WEEK =
  /(?:tr[ée]sorerie|cash[ -]?flow)[\s\S]{0,160}\b13\s+semaines?\b|\b13\s+semaines?[\s\S]{0,160}(?:tr[ée]sorerie|cash[ -]?flow)/i;
const DOWNLOAD_SCENE =
  /(?:t[ée]l[ée]charg|classeur|fichier|lien court|qr\s*code|ressource|workbook|spreadsheet)/i;
const DIAGNOSTIC_SCENE = /(?:diagnostic|python|analyse|[ée]valuation|retour)/i;
const PREMATURE_VERDICT =
  /(?:travail conforme|bonne analyse|aucun axe|aucune am[ée]lioration|r[ée]ussi|valid[ée]|score|note\s*[:=]|100\s*\/\s*100)/i;
const DECORATIVE_RESOURCE_MEDIA =
  /(?:qr\s*code|code\s*qr|lien\s*court|short\s*link|download\s*link|t[ée]l[ée]chargement)/i;
const EXPLICIT_MAD_THRESHOLD =
  /(?:seuil[\s\S]{0,40}\b\d[\d\s.,]*\s*MAD\b|\b\d[\d\s.,]*\s*MAD\b[\s\S]{0,40}seuil)/i;
const UNSPECIFIED_THRESHOLD_POINT = /(?:seuil|minimal)[\s\S]{0,40}(?:MAD|montant|valeur)/i;
const FINAL_ASSESSMENT =
  /(?:quiz|test|[ée]valuation)[\s\S]{0,32}(?:finale?|des acquis)|(?:finale?|des acquis)[\s\S]{0,32}(?:quiz|test|[ée]valuation)/i;
const DOCUMENT_WORDS = /\b(?:document|docx|guide|fiche|checklist|mode d['’]emploi)\b/i;
const EXPLICIT_QUIZ_COUNT = new RegExp(
  String.raw`\b(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:questions?|items?)\b`,
  'i',
);
const QUIZ_COUNT_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};

function outlineText(outline: SceneOutline): string {
  return [outline.title, outline.description, ...(outline.keyPoints ?? [])].join(' ');
}

function requestedQuizCount(requirement: string): number | undefined {
  const token = requirement.match(EXPLICIT_QUIZ_COUNT)?.[1]?.toLocaleLowerCase('fr-FR');
  if (!token) return undefined;
  const count = Number.parseInt(token, 10) || QUIZ_COUNT_WORDS[token];
  return count && count <= 20 ? count : undefined;
}

function sanitizeUnspecifiedThreshold(value: string): string {
  return EXPLICIT_MAD_THRESHOLD.test(value)
    ? 'Interpréter une alerte à partir du seuil configurable, sans inventer de montant.'
    : value;
}

function workbookRequest(
  id: string,
  requirement: string,
  cashFlow13Week: boolean,
): ResourceGenerationRequest {
  if (cashFlow13Week) {
    return {
      id,
      format: 'xlsx',
      title: 'Prévision de trésorerie sur 13 semaines',
      fileName: 'prevision-tresorerie-13-semaines.xlsx',
      prompt: [
        'Créer un classeur Excel professionnel, modifiable et directement utilisable.',
        'Prévoir treize colonnes hebdomadaires, les hypothèses, les encaissements, les décaissements, le solde initial, le solde final, les alertes et plusieurs scénarios.',
        'Utiliser exclusivement le MAD et conserver les formules nécessaires au contrôle automatisé.',
        requirement,
      ].join(' '),
      evaluationProfile: 'cash-flow-13-week',
    };
  }
  return {
    id,
    format: 'xlsx',
    title: 'Classeur d’exercice',
    fileName: 'classeur-exercice.xlsx',
    prompt: `Créer un classeur Excel modifiable, complet et directement utilisable pour cette formation. Exigence de l’auteur : ${requirement}`,
  };
}

/**
 * Converts explicit author promises into executable contracts. Prompt rules
 * improve model output, but this boundary prevents a model omission from
 * producing a fake file, link, upload or assessment later in the pipeline.
 */
export function enforceExecutableObligations(
  plan: ClassroomPlan,
  requirement: string,
): ClassroomPlan {
  const workbookRequired = WORKBOOK_WORDS.test(requirement) && WORKBOOK_ACTIONS.test(requirement);
  const cashFlow13Week = CASH_FLOW_13_WEEK.test(requirement);
  const outlines = plan.outlines.map((outline) => ({
    ...outline,
    keyPoints: [...(outline.keyPoints ?? [])],
    resourceGenerations: outline.resourceGenerations?.map((resource) => ({ ...resource })),
    mediaGenerations: outline.mediaGenerations?.map((media) => ({ ...media })),
  }));

  if (!EXPLICIT_MAD_THRESHOLD.test(requirement)) {
    for (const outline of outlines) {
      outline.title = sanitizeUnspecifiedThreshold(outline.title);
      outline.description = sanitizeUnspecifiedThreshold(outline.description);
      outline.keyPoints = outline.keyPoints.map(sanitizeUnspecifiedThreshold);
    }
  }

  const explicitQuizCount = requestedQuizCount(requirement);
  if (FINAL_ASSESSMENT.test(requirement)) {
    let finalQuizIndex = outlines.findIndex(
      (outline) => outline.type === 'quiz' && /finale?|des acquis/i.test(outlineText(outline)),
    );
    if (finalQuizIndex < 0 && outlines.length > 0) {
      finalQuizIndex = outlines.length - 1;
      const previous = outlines[finalQuizIndex];
      outlines[finalQuizIndex] = {
        id: previous.id,
        type: 'quiz',
        title: 'Quiz final de validation des acquis',
        description:
          'Vérifier la maîtrise des objectifs annoncés à partir du contenu de cette formation.',
        keyPoints:
          previous.keyPoints.length > 0 ? previous.keyPoints : [plan.syllabus.overallObjective],
        order: previous.order,
        teachingObjective: previous.teachingObjective,
        estimatedDuration: previous.estimatedDuration,
        resourceGenerations: undefined,
        mediaGenerations: undefined,
        quizConfig: {
          questionCount: explicitQuizCount ?? 5,
          difficulty: 'medium',
          questionTypes: ['single'],
        },
      };
    }
    const finalQuiz = outlines[finalQuizIndex];
    if (finalQuiz?.type === 'quiz') {
      finalQuiz.quizConfig = {
        questionCount: explicitQuizCount ?? finalQuiz.quizConfig?.questionCount ?? 5,
        difficulty: finalQuiz.quizConfig?.difficulty ?? 'medium',
        questionTypes: finalQuiz.quizConfig?.questionTypes?.length
          ? finalQuiz.quizConfig.questionTypes
          : ['single'],
      };
    }
  }

  if (!workbookRequired) return { ...plan, outlines };

  const existingWorkbook = outlines
    .flatMap((outline, outlineIndex) =>
      (outline.resourceGenerations ?? []).map((resource) => ({
        outlineIndex,
        resource,
      })),
    )
    .find(({ resource }) => resource.format === 'xlsx');
  let targetIndex = outlines.findIndex(
    (outline) =>
      outline.type === 'slide' &&
      outline.resourceGenerations?.some((resource) => resource.format === 'xlsx'),
  );
  if (targetIndex < 0) {
    targetIndex = outlines.findIndex(
      (outline) => outline.type === 'slide' && DOWNLOAD_SCENE.test(outlineText(outline)),
    );
  }
  if (targetIndex < 0) {
    const pblIndex = outlines.findIndex((outline) => outline.type === 'pbl');
    const candidates = outlines
      .map((outline, index) => ({ outline, index }))
      .filter(
        ({ outline, index }) => outline.type === 'slide' && (pblIndex < 0 || index < pblIndex),
      );
    targetIndex =
      candidates.at(-1)?.index ?? outlines.findIndex((outline) => outline.type === 'slide');
  }
  if (targetIndex < 0) return plan;

  const target = outlines[targetIndex];
  if (existingWorkbook && existingWorkbook.outlineIndex !== targetIndex) {
    const source = outlines[existingWorkbook.outlineIndex];
    source.resourceGenerations = source.resourceGenerations?.filter(
      (resource) => resource !== existingWorkbook.resource,
    );
    target.resourceGenerations = [...(target.resourceGenerations ?? []), existingWorkbook.resource];
  }
  const existingIndex = target.resourceGenerations?.findIndex(
    (resource) => resource.format === 'xlsx',
  );
  if (existingIndex !== undefined && existingIndex >= 0 && target.resourceGenerations) {
    if (cashFlow13Week) {
      target.resourceGenerations[existingIndex] = {
        ...target.resourceGenerations[existingIndex],
        evaluationProfile: 'cash-flow-13-week',
      };
    }
  } else {
    target.resourceGenerations = [
      ...(target.resourceGenerations ?? []),
      workbookRequest(`workbook-${target.id}`, requirement, cashFlow13Week),
    ];
  }
  target.description =
    'Téléchargez le classeur réellement généré à partir du lien court ou du QR code affiché, puis ouvrez-le avant de poursuivre.';
  target.keyPoints = [
    'Le lien court affiché ouvre le fichier réel de cette formation.',
    'Le QR code donne accès exactement au même fichier.',
    'La formation attend votre action explicite avant de poursuivre.',
  ];

  const documentExplicitlyRequired =
    DOCUMENT_WORDS.test(requirement) && WORKBOOK_ACTIONS.test(requirement);
  for (const [index, outline] of outlines.entries()) {
    if (!outline.resourceGenerations?.length) continue;
    outline.resourceGenerations = outline.resourceGenerations.filter(
      (resource) =>
        (resource.format === 'xlsx' && index === targetIndex) ||
        (resource.format === 'docx' && documentExplicitlyRequired),
    );
    if (
      index !== targetIndex &&
      outline.type === 'slide' &&
      DOWNLOAD_SCENE.test(outlineText(outline)) &&
      outline.resourceGenerations.length === 0
    ) {
      outline.title = 'Préparer le classeur au dépôt';
      outline.description =
        'Vérifiez le classeur téléchargé précédemment, complétez les hypothèses et conservez son nom avant le dépôt.';
      outline.keyPoints = [
        'Contrôler les treize semaines et la devise MAD.',
        'Vérifier les formules et le seuil configurable.',
        'Enregistrer le classeur avant de passer à son analyse.',
      ];
    }
  }

  for (const [index, outline] of outlines.entries()) {
    if (index === targetIndex || !outline.mediaGenerations?.length) continue;
    outline.mediaGenerations = outline.mediaGenerations.filter(
      (media) => !DECORATIVE_RESOURCE_MEDIA.test(media.prompt),
    );
  }

  if (cashFlow13Week) {
    if (!EXPLICIT_MAD_THRESHOLD.test(requirement)) {
      for (const outline of outlines) {
        if (outline.type !== 'quiz') continue;
        outline.keyPoints = outline.keyPoints.map((point) =>
          UNSPECIFIED_THRESHOLD_POINT.test(point)
            ? 'Interpréter une alerte à partir du seuil configuré dans le classeur, sans inventer de montant.'
            : point,
        );
      }
    }

    const pblIndex = outlines.findIndex((outline) => outline.type === 'pbl');
    for (let index = Math.max(pblIndex + 1, 0); index < outlines.length; index += 1) {
      const outline = outlines[index];
      const text = outlineText(outline);
      if (outline.type === 'slide' && DIAGNOSTIC_SCENE.test(text) && PREMATURE_VERDICT.test(text)) {
        outline.title = 'Comprendre le diagnostic Python';
        outline.description =
          'Le diagnostic sera produit uniquement après le dépôt et l’analyse du classeur réellement complété.';
        outline.keyPoints = [
          'Python contrôle la structure, les formules, les signes, les calculs et le scénario.',
          'Le résultat dépend exclusivement du fichier réellement déposé par l’apprenant.',
          'La formatrice explique ensuite les constats et propose des améliorations si elles sont nécessaires.',
          'Aucun verdict ni score n’est annoncé avant cette analyse.',
        ];
      }
    }
  }

  return { ...plan, outlines };
}
