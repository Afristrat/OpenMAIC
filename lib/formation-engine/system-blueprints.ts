import type { ClassroomTemplate } from '@/lib/supabase/types';

type SupportedLocale = 'fr-FR' | 'ar-MA' | 'en-US';

interface BlueprintCopy {
  name: string;
  description: string;
  requirement: string;
}

interface BlueprintDefinition {
  id: string;
  approach: 'pedagogy' | 'hybrid' | 'andragogy';
  copy: Record<SupportedLocale, BlueprintCopy>;
}

const BLUEPRINTS: readonly BlueprintDefinition[] = [
  {
    id: 'system-performance',
    approach: 'andragogy',
    copy: {
      'fr-FR': {
        name: 'Réussir une performance professionnelle',
        description:
          'Part d’une situation réelle, fait pratiquer, puis vérifie une production directement utilisable.',
        requirement:
          'Créez une formation sur [sujet] pour [public]. Commencez par la situation professionnelle à réussir et son enjeu. Mobilisez l’expérience disponible, faites pratiquer sur un cas crédible, puis exigez une production observable et directement utilisable. Demandez les informations manquantes au lieu de les inventer.',
      },
      'ar-MA': {
        name: 'إنجاز أداء مهني ناجح',
        description: 'ينطلق من وضعية حقيقية، ثم يدرّب المتعلم ويتحقق من إنتاج قابل للاستخدام.',
        requirement:
          'أنشئ تكويناً حول [الموضوع] لفائدة [الجمهور]. ابدأ بالوضعية المهنية المطلوب إنجازها وبأهميتها. وظّف الخبرة المتاحة، واقترح تدريباً على حالة واقعية، ثم اطلب إنتاجاً قابلاً للملاحظة والاستخدام. اسأل عن المعلومات الناقصة ولا تخترعها.',
      },
      'en-US': {
        name: 'Perform a professional task',
        description:
          'Starts from a real situation, builds practice, and verifies a usable work product.',
        requirement:
          'Create training on [topic] for [audience]. Start with the professional situation they must handle and why it matters. Use relevant prior experience, provide practice on a credible case, then require an observable, usable work product. Ask for missing facts instead of inventing them.',
      },
    },
  },
  {
    id: 'system-decision',
    approach: 'andragogy',
    copy: {
      'fr-FR': {
        name: 'Prendre une décision argumentée',
        description:
          'Compare des options sur des critères explicites et conduit à une décision défendable.',
        requirement:
          'Créez une formation sur [décision à prendre] pour [public]. Présentez une situation réaliste, rendez visibles les critères, contraintes et incertitudes, faites comparer plusieurs options, puis demandez une décision argumentée et un plan de vérification. Ne présentez aucune hypothèse comme un fait.',
      },
      'ar-MA': {
        name: 'اتخاذ قرار معلّل',
        description: 'يقارن البدائل وفق معايير واضحة وينتهي بقرار يمكن الدفاع عنه.',
        requirement:
          'أنشئ تكويناً حول [القرار المطلوب] لفائدة [الجمهور]. قدّم وضعية واقعية، ووضّح المعايير والقيود ومواطن عدم اليقين، ثم اطلب مقارنة عدة بدائل وصياغة قرار معلّل وخطة للتحقق منه. لا تقدّم أي افتراض على أنه حقيقة.',
      },
      'en-US': {
        name: 'Make an evidence-based decision',
        description:
          'Compares options against explicit criteria and produces a defensible decision.',
        requirement:
          'Create training on [decision] for [audience]. Present a realistic situation, expose the criteria, constraints, and uncertainties, compare several options, then require a reasoned decision and a verification plan. Never present an assumption as a fact.',
      },
    },
  },
  {
    id: 'system-onboarding',
    approach: 'hybrid',
    copy: {
      'fr-FR': {
        name: 'Prendre en main un rôle ou un outil',
        description:
          'Guide les premiers pas, prévient les erreurs critiques et retire progressivement l’aide.',
        requirement:
          'Créez un parcours de prise en main de [rôle, outil ou processus] pour [public]. Diagnostiquez les acquis, montrez un premier exemple commenté, guidez une réalisation, puis retirez progressivement l’aide. Intégrez les erreurs critiques, leurs signaux et une vérification finale en autonomie.',
      },
      'ar-MA': {
        name: 'التمكن من دور أو أداة',
        description: 'يوجّه الخطوات الأولى، ويمنع الأخطاء الحرجة، ثم يقلّل المساعدة تدريجياً.',
        requirement:
          'أنشئ مساراً للتمكن من [الدور أو الأداة أو المسار] لفائدة [الجمهور]. شخّص المكتسبات، واعرض مثالاً مشروحاً، ثم وجّه إنجازاً عملياً وقلّل المساعدة تدريجياً. أدرج الأخطاء الحرجة وإشاراتها وتحققاً نهائياً باستقلالية.',
      },
      'en-US': {
        name: 'Get started in a role or tool',
        description:
          'Guides first attempts, prevents critical errors, then gradually removes support.',
        requirement:
          'Create an onboarding pathway for [role, tool, or process] for [audience]. Diagnose prior knowledge, demonstrate one worked example, guide a first attempt, then gradually remove support. Include critical errors, their warning signs, and a final independent check.',
      },
    },
  },
  {
    id: 'system-safe-procedure',
    approach: 'pedagogy',
    copy: {
      'fr-FR': {
        name: 'Exécuter une procédure sans erreur',
        description:
          'Décompose une procédure sensible, entraîne les décisions clés et vérifie une exécution sûre.',
        requirement:
          'Créez une formation sur la procédure [nom] pour [public]. Identifiez les prérequis et les risques, décomposez uniquement les étapes utiles, faites reconnaître les signaux d’alerte, puis simulez l’exécution complète. La réussite doit être prouvée par une observation ou une production vérifiable.',
      },
      'ar-MA': {
        name: 'تنفيذ إجراء دون أخطاء',
        description: 'يفكك الإجراء الحساس، ويدرّب على القرارات الأساسية، ويتحقق من التنفيذ الآمن.',
        requirement:
          'أنشئ تكويناً حول الإجراء [الاسم] لفائدة [الجمهور]. حدّد المتطلبات والمخاطر، وفكك الخطوات الضرورية فقط، ودرّب على التعرف على إشارات التحذير، ثم حاكِ التنفيذ الكامل. يجب إثبات النجاح بملاحظة أو إنتاج قابل للتحقق.',
      },
      'en-US': {
        name: 'Execute a procedure safely',
        description:
          'Breaks down a sensitive procedure, rehearses key decisions, and verifies safe execution.',
        requirement:
          'Create training on procedure [name] for [audience]. Identify prerequisites and risks, break down only the necessary steps, practise recognising warning signs, then simulate the full execution. Success must be demonstrated through an observable or verifiable output.',
      },
    },
  },
  {
    id: 'system-problem-solving',
    approach: 'andragogy',
    copy: {
      'fr-FR': {
        name: 'Résoudre un problème complexe',
        description:
          'Fait enquêter sur les causes, confronte plusieurs hypothèses et aboutit à une expérimentation.',
        requirement:
          'Créez un atelier sur [problème] pour [public]. Partez d’un cas authentique ou clairement fictif, faites distinguer symptômes, causes et contraintes, confrontez plusieurs hypothèses, puis construisez une expérimentation à faible risque avec critères de réussite et conditions d’arrêt.',
      },
      'ar-MA': {
        name: 'حل مشكلة معقدة',
        description: 'يبحث في الأسباب، ويقارن الفرضيات، وينتهي بتجربة قابلة للتنفيذ.',
        requirement:
          'أنشئ ورشة حول [المشكلة] لفائدة [الجمهور]. انطلق من حالة حقيقية أو معلنة بوضوح كحالة افتراضية، وميّز بين الأعراض والأسباب والقيود، وقارن عدة فرضيات، ثم صمّم تجربة منخفضة المخاطر بمعايير نجاح وشروط توقف.',
      },
      'en-US': {
        name: 'Solve a complex problem',
        description:
          'Investigates causes, challenges competing hypotheses, and ends with an experiment.',
        requirement:
          'Create a workshop on [problem] for [audience]. Start from an authentic or clearly fictional case, distinguish symptoms, causes, and constraints, challenge several hypotheses, then design a low-risk experiment with success criteria and stop conditions.',
      },
    },
  },
  {
    id: 'system-microlearning',
    approach: 'hybrid',
    copy: {
      'fr-FR': {
        name: 'Rappel opérationnel court',
        description:
          'Une séquence brève centrée sur une seule décision, erreur ou compétence à réactiver.',
        requirement:
          'Créez un rappel de moins de dix minutes sur [point précis] pour [public]. Limitez-vous à un objectif observable, un exemple, une erreur fréquente, une mise en pratique courte et une vérification immédiate. Supprimez tout contenu qui ne contribue pas directement à cette performance.',
      },
      'ar-MA': {
        name: 'تذكير عملي قصير',
        description: 'وحدة قصيرة تركز على قرار أو خطأ أو مهارة واحدة تحتاج إلى الاسترجاع.',
        requirement:
          'أنشئ تذكيراً لا يتجاوز عشر دقائق حول [نقطة محددة] لفائدة [الجمهور]. التزم بهدف واحد قابل للملاحظة، ومثال واحد، وخطأ شائع، وتطبيق قصير، وتحقق فوري. احذف كل محتوى لا يساهم مباشرة في هذا الأداء.',
      },
      'en-US': {
        name: 'Short operational refresher',
        description:
          'A brief sequence focused on one decision, error, or skill that needs refreshing.',
        requirement:
          'Create a refresher under ten minutes on [specific point] for [audience]. Use one observable objective, one example, one common error, one short practice task, and one immediate check. Remove anything that does not directly support that performance.',
      },
    },
  },
] as const;

export function getSystemBlueprints(locale: string): ClassroomTemplate[] {
  const supportedLocale: SupportedLocale =
    locale === 'ar-MA' || locale === 'en-US' ? locale : 'fr-FR';
  return BLUEPRINTS.map((blueprint) => {
    const copy = blueprint.copy[supportedLocale];
    return {
      id: blueprint.id,
      name: copy.name,
      sector: 'method',
      description: copy.description,
      requirements: {
        requirement: copy.requirement,
        learningApproach: blueprint.approach,
      },
      agent_config_ids: null,
      skill_ids: ['formation-design-pro'],
      org_id: null,
      created_by: null,
      language: supportedLocale,
      created_at: '2026-08-07T00:00:00.000Z',
    };
  });
}
