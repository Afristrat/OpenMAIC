import type { Locale } from '@/lib/i18n';

export type CommercialLocale = Exclude<Locale, 'zh-CN'>;

export interface AgentCopy {
  role: string;
  purpose: string;
}

export interface CommercialCopy {
  nav: {
    experience: string;
    agents: string;
    institutions: string;
    offers: string;
    login: string;
    proposal: string;
    menu: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    proof: string[];
    sourceLabel: string;
    sourceTitle: string;
    sourceMeta: string;
    classLabel: string;
    classTitle: string;
    narration: string;
    interaction: string;
  };
  experience: {
    eyebrow: string;
    title: string;
    body: string;
    steps: Array<{ number: string; title: string; body: string }>;
  };
  agents: {
    eyebrow: string;
    title: string;
    body: string;
    settings: string[];
    roster: AgentCopy[];
  };
  studio: {
    eyebrow: string;
    title: string;
    body: string;
    points: Array<{ title: string; body: string }>;
    canvasLabel: string;
    slideTitle: string;
    slideBody: string;
    notesLabel: string;
    notes: string;
    regenerate: string;
  };
  institutions: {
    eyebrow: string;
    title: string;
    body: string;
    points: string[];
    cta: string;
  };
  offers: {
    eyebrow: string;
    title: string;
    body: string;
    studio: {
      name: string;
      audience: string;
      price: string;
      features: string[];
      cta: string;
    };
    institution: {
      name: string;
      audience: string;
      price: string;
      features: string[];
      cta: string;
    };
    precision: string;
  };
  closing: {
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
  };
  footer: {
    promise: string;
    product: string;
    company: string;
    legal: string;
    contact: string;
    privacy: string;
    terms: string;
    rights: string;
  };
}

export const commercialCopy: Record<CommercialLocale, CommercialCopy> = {
  'fr-FR': {
    nav: {
      experience: 'Expérience',
      agents: 'Les 10 agents',
      institutions: 'Institutions',
      offers: 'Offres',
      login: 'Se connecter',
      proposal: 'Recevoir une proposition',
      menu: 'Ouvrir le menu',
    },
    hero: {
      eyebrow: 'Studio de formation immersive',
      title: 'Vos contenus deviennent une classe qui parle, questionne et fait agir.',
      body: 'Qalem transforme vos sources et votre expertise en une expérience enseignée par une équipe d’agents pédagogiques. Vous gardez la main sur le fond, la voix, les médias et chaque prise de parole.',
      primary: 'Recevoir une proposition',
      secondary: 'Voir une démonstration',
      proof: ['Sources citées', 'Narration éditable', 'Français, arabe et anglais'],
      sourceLabel: 'Matière de départ',
      sourceTitle: 'Vos documents et une recherche web sourcée',
      sourceMeta: 'Contenu analysé et structuré',
      classLabel: 'Classe produite',
      classTitle: 'Une expérience guidée par dix rôles complémentaires',
      narration: 'Narration synchronisée',
      interaction: 'Interventions orchestrées',
    },
    experience: {
      eyebrow: 'De la matière à l’expérience',
      title: 'Une chaîne de production continue, avec un contrôle humain à chaque étape.',
      body: 'Qalem ne se contente pas de fabriquer des diapositives. La plateforme relie la recherche, la conception pédagogique, la narration, l’interaction et la diffusion dans un même studio.',
      steps: [
        {
          number: '01',
          title: 'Ancrer dans des sources',
          body: 'Partez d’un sujet, de vos documents ou d’une recherche web enrichie par le contenu réel des pages retenues.',
        },
        {
          number: '02',
          title: 'Concevoir pour un public',
          body: 'Définissez le niveau, le public, l’approche pédagogique et l’intensité des interactions avant la génération.',
        },
        {
          number: '03',
          title: 'Éditer le fond et la voix',
          body: 'Corrigez les diapositives, le texte de narration et chaque prise de parole, puis régénérez la voix validée.',
        },
        {
          number: '04',
          title: 'Diffuser dans le bon format',
          body: 'Publiez une classe persistante et partageable, puis exportez en PPTX ou en MP4 lorsque le contexte l’exige.',
        },
      ],
    },
    agents: {
      eyebrow: 'Une équipe, pas une mascotte',
      title: 'Dix mécanismes pédagogiques qui donnent du relief à chaque session.',
      body: 'Chaque agent a une fonction cognitive précise. Son prénom, son avatar, son genre, sa voix et sa fréquence d’intervention se règlent au niveau de l’organisation.',
      settings: [
        'Prénom et avatar',
        'Voix compatible',
        'Fréquence d’intervention',
        'Niveau et public',
      ],
      roster: [
        { role: 'Le Professeur', purpose: 'Structure, explique et vérifie la compréhension.' },
        { role: 'L’Assistante pédagogique', purpose: 'Reformule et réduit la charge cognitive.' },
        { role: 'La Rigolote', purpose: 'Crée un ancrage mémorable par un humour pertinent.' },
        { role: 'Le Curieux', purpose: 'Fait émerger les questions que l’on n’ose pas poser.' },
        { role: 'Le Secrétaire', purpose: 'Consolide les échanges en synthèses actionnables.' },
        { role: 'La Penseuse', purpose: 'Relie les idées et révèle leurs implications.' },
        { role: 'L’Analyste', purpose: 'Teste les affirmations face aux faits et aux critères.' },
        { role: 'La Coach', purpose: 'Transforme la compréhension en passage à l’action.' },
        {
          role: 'L’Avocat du Diable',
          purpose: 'Renforce le raisonnement par une objection crédible.',
        },
        { role: 'La Créative', purpose: 'Ouvre une piste inattendue et la rend testable.' },
      ],
    },
    studio: {
      eyebrow: 'Le Studio Qalem',
      title: 'L’intelligence générative propose. Votre expertise décide.',
      body: 'Le contenu final ne doit jamais être prisonnier d’une première génération. Le studio vous laisse intervenir là où la qualité se joue vraiment.',
      points: [
        {
          title: 'Diapositives éditables',
          body: 'Corrigez les textes, les visuels et la composition directement dans le canevas.',
        },
        {
          title: 'Narration maîtrisée',
          body: 'Réécrivez les notes de présentation et régénérez uniquement la prise de parole concernée.',
        },
        {
          title: 'Voix et médias configurables',
          body: 'Choisissez les moteurs autorisés pour la voix, l’image et la vidéo selon votre déploiement.',
        },
        {
          title: 'Sorties cohérentes',
          body: 'La classe, la narration et les exports restent liés à la même matière pédagogique.',
        },
      ],
      canvasLabel: 'Éditeur de classe',
      slideTitle: 'Décider sous incertitude',
      slideBody: 'Trois critères pour distinguer un risque acceptable d’un pari aveugle.',
      notesLabel: 'Notes de présentation',
      notes:
        'Commencez par le coût de l’inaction. Comparez ensuite la réversibilité, la qualité des preuves et le temps disponible.',
      regenerate: 'Régénérer la voix',
    },
    institutions: {
      eyebrow: 'Déploiement institutionnel',
      title: 'Industrialisez la qualité sans uniformiser les formations.',
      body: 'Qalem donne aux académies, organismes de formation et directions des talents un cadre commun pour produire, gouverner et diffuser leurs expériences.',
      points: [
        'Membres, rôles et paramètres d’organisation',
        'Bibliothèque partagée et modèles de classes',
        'Personnalités, voix et intensité d’interaction configurables',
        'Curriculum et rapports consolidés',
      ],
      cta: 'Parler de votre déploiement',
    },
    offers: {
      eyebrow: 'Offres commerciales',
      title: 'Deux façons d’acheter Qalem, selon votre niveau de gouvernance.',
      body: 'Le périmètre est cadré avant engagement afin d’aligner les modèles, les volumes, l’hébergement et l’accompagnement sur votre usage réel.',
      studio: {
        name: 'Qalem Studio',
        audience: 'Pour les équipes qui conçoivent et produisent des formations.',
        price: 'Sur proposition',
        features: [
          'Génération sourcée et studio éditorial',
          'Classe interactive avec dix agents',
          'Narration, médias et exports',
          'Accompagnement de mise en service',
        ],
        cta: 'Recevoir la proposition Studio',
      },
      institution: {
        name: 'Qalem Institution',
        audience: 'Pour les déploiements à plusieurs équipes ou plusieurs entités.',
        price: 'Sur proposition',
        features: [
          'Tout le périmètre Studio',
          'Administration de l’organisation',
          'Bibliothèque, curriculum et rapports',
          'Architecture et accompagnement dédiés',
        ],
        cta: 'Construire la proposition Institution',
      },
      precision:
        'Chaque proposition précise les capacités activées, les responsabilités, les volumes, le support et les conditions commerciales.',
    },
    closing: {
      eyebrow: 'Une preuve sur votre terrain',
      title: 'Voyez Qalem travailler sur un sujet qui compte pour vous.',
      body: 'La démonstration guidée montre la chaîne complète : sources, conception, dix agents, voix, édition et diffusion, sur un cas d’usage représentatif.',
      primary: 'Recevoir une proposition',
      secondary: 'Planifier la démonstration',
    },
    footer: {
      promise: 'Des formations conçues comme des expériences vivantes, éditables et gouvernables.',
      product: 'Produit',
      company: 'Entreprise',
      legal: 'Informations légales',
      contact: 'Contact',
      privacy: 'Confidentialité',
      terms: 'Conditions',
      rights: 'Tous droits réservés.',
    },
  },
  'en-US': {
    nav: {
      experience: 'Experience',
      agents: 'The 10 agents',
      institutions: 'Institutions',
      offers: 'Offers',
      login: 'Sign in',
      proposal: 'Get a proposal',
      menu: 'Open menu',
    },
    hero: {
      eyebrow: 'Immersive learning studio',
      title: 'Your content becomes a class that speaks, questions and drives action.',
      body: 'Qalem turns your sources and expertise into an experience taught by a team of pedagogical agents. You retain control over the substance, voice, media and every spoken line.',
      primary: 'Get a proposal',
      secondary: 'See a demonstration',
      proof: ['Cited sources', 'Editable narration', 'French, Arabic and English'],
      sourceLabel: 'Starting material',
      sourceTitle: 'Your documents and sourced web research',
      sourceMeta: 'Content analysed and structured',
      classLabel: 'Produced class',
      classTitle: 'An experience guided by ten complementary roles',
      narration: 'Synchronized narration',
      interaction: 'Orchestrated interactions',
    },
    experience: {
      eyebrow: 'From material to experience',
      title: 'One continuous production chain, with human control at every stage.',
      body: 'Qalem does more than produce slides. The platform connects research, learning design, narration, interaction and delivery in one studio.',
      steps: [
        {
          number: '01',
          title: 'Ground the content in sources',
          body: 'Start with a topic, your documents or web research enriched with the actual content of selected pages.',
        },
        {
          number: '02',
          title: 'Design for an audience',
          body: 'Set the level, audience, learning approach and interaction intensity before generation.',
        },
        {
          number: '03',
          title: 'Edit substance and voice',
          body: 'Correct slides, narration text and every spoken line, then regenerate the approved voice.',
        },
        {
          number: '04',
          title: 'Deliver in the right format',
          body: 'Publish a persistent shareable class, then export to PPTX or MP4 when the context requires it.',
        },
      ],
    },
    agents: {
      eyebrow: 'A team, not a mascot',
      title: 'Ten pedagogical mechanisms that give every session depth.',
      body: 'Each agent has a precise cognitive function. Its name, avatar, gender, voice and interaction frequency can be configured for the organization.',
      settings: [
        'Name and avatar',
        'Compatible voice',
        'Interaction frequency',
        'Level and audience',
      ],
      roster: [
        { role: 'The Professor', purpose: 'Structures, explains and checks understanding.' },
        { role: 'The Teaching Assistant', purpose: 'Reframes and reduces cognitive load.' },
        { role: 'The Joker', purpose: 'Creates memorable anchors through relevant humour.' },
        { role: 'The Curious One', purpose: 'Surfaces the questions people hesitate to ask.' },
        { role: 'The Secretary', purpose: 'Turns discussion into actionable summaries.' },
        { role: 'The Thinker', purpose: 'Connects ideas and reveals their implications.' },
        { role: 'The Analyst', purpose: 'Tests claims against facts and criteria.' },
        { role: 'The Coach', purpose: 'Turns understanding into action.' },
        {
          role: 'The Devil’s Advocate',
          purpose: 'Strengthens reasoning with a credible objection.',
        },
        { role: 'The Creative', purpose: 'Opens an unexpected path and makes it testable.' },
      ],
    },
    studio: {
      eyebrow: 'The Qalem Studio',
      title: 'Generative intelligence proposes. Your expertise decides.',
      body: 'Final content should never be trapped in a first generation. The studio lets you intervene where quality truly matters.',
      points: [
        {
          title: 'Editable slides',
          body: 'Correct text, visuals and composition directly on the canvas.',
        },
        {
          title: 'Controlled narration',
          body: 'Rewrite presenter notes and regenerate only the spoken line concerned.',
        },
        {
          title: 'Configurable voices and media',
          body: 'Choose the approved voice, image and video engines for your deployment.',
        },
        {
          title: 'Consistent outputs',
          body: 'The class, narration and exports remain connected to the same learning material.',
        },
      ],
      canvasLabel: 'Class editor',
      slideTitle: 'Deciding under uncertainty',
      slideBody: 'Three criteria to distinguish an acceptable risk from a blind bet.',
      notesLabel: 'Presenter notes',
      notes:
        'Begin with the cost of inaction. Then compare reversibility, evidence quality and the time available.',
      regenerate: 'Regenerate voice',
    },
    institutions: {
      eyebrow: 'Institutional deployment',
      title: 'Scale quality without making every course identical.',
      body: 'Qalem gives academies, training organizations and talent leaders a shared framework to produce, govern and deliver their experiences.',
      points: [
        'Organization members, roles and settings',
        'Shared library and classroom templates',
        'Configurable personae, voices and interaction intensity',
        'Curriculum and consolidated reports',
      ],
      cta: 'Discuss your deployment',
    },
    offers: {
      eyebrow: 'Commercial offers',
      title: 'Two ways to buy Qalem, based on the governance you need.',
      body: 'Scope is defined before commitment so models, volumes, hosting and support match your actual use.',
      studio: {
        name: 'Qalem Studio',
        audience: 'For teams that design and produce learning experiences.',
        price: 'Custom proposal',
        features: [
          'Sourced generation and editorial studio',
          'Interactive class with ten agents',
          'Narration, media and exports',
          'Launch support',
        ],
        cta: 'Get the Studio proposal',
      },
      institution: {
        name: 'Qalem Institution',
        audience: 'For deployments across multiple teams or entities.',
        price: 'Custom proposal',
        features: [
          'Everything in Studio',
          'Organization administration',
          'Library, curriculum and reports',
          'Dedicated architecture and support',
        ],
        cta: 'Build the Institution proposal',
      },
      precision:
        'Each proposal specifies enabled capabilities, responsibilities, volumes, support and commercial terms.',
    },
    closing: {
      eyebrow: 'Evidence on your ground',
      title: 'See Qalem work on a subject that matters to you.',
      body: 'The guided demonstration covers the complete chain: sources, design, ten agents, voices, editing and delivery, using a representative use case.',
      primary: 'Get a proposal',
      secondary: 'Schedule the demonstration',
    },
    footer: {
      promise: 'Learning experiences designed to be alive, editable and governable.',
      product: 'Product',
      company: 'Company',
      legal: 'Legal information',
      contact: 'Contact',
      privacy: 'Privacy',
      terms: 'Terms',
      rights: 'All rights reserved.',
    },
  },
  'ar-MA': {
    nav: {
      experience: 'التجربة',
      agents: 'الوكلاء العشرة',
      institutions: 'المؤسسات',
      offers: 'العروض',
      login: 'تسجيل الدخول',
      proposal: 'طلب عرض تجاري',
      menu: 'فتح القائمة',
    },
    hero: {
      eyebrow: 'استوديو للتعلّم الغامر',
      title: 'يتحوّل محتواكم إلى فصل يشرح ويسأل ويدفع إلى التطبيق.',
      body: 'تحوّل قلم مصادركم وخبرتكم إلى تجربة تقودها مجموعة من الوكلاء التربويين. وتحتفظون بالتحكم في المضمون والصوت والوسائط وكل مداخلة منطوقة.',
      primary: 'طلب عرض تجاري',
      secondary: 'مشاهدة عرض توضيحي',
      proof: ['مصادر موثقة', 'سرد قابل للتحرير', 'العربية والفرنسية والإنجليزية'],
      sourceLabel: 'المادة الأصلية',
      sourceTitle: 'وثائقكم وبحث موثق على الويب',
      sourceMeta: 'محتوى محلل ومنظم',
      classLabel: 'الفصل المنتج',
      classTitle: 'تجربة تقودها عشرة أدوار متكاملة',
      narration: 'سرد صوتي متزامن',
      interaction: 'مداخلات منسقة',
    },
    experience: {
      eyebrow: 'من المادة إلى التجربة',
      title: 'سلسلة إنتاج واحدة مع تحكم بشري في كل مرحلة.',
      body: 'لا تكتفي قلم بإنتاج الشرائح، بل تجمع البحث والتصميم التعليمي والسرد والتفاعل والنشر داخل استوديو واحد.',
      steps: [
        {
          number: '01',
          title: 'الارتكاز على المصادر',
          body: 'ابدؤوا بموضوع أو بوثائقكم أو ببحث على الويب يغتني بالمحتوى الفعلي للصفحات المختارة.',
        },
        {
          number: '02',
          title: 'التصميم لفئة محددة',
          body: 'حددوا المستوى والفئة والمنهج التعليمي وكثافة التفاعل قبل التوليد.',
        },
        {
          number: '03',
          title: 'تحرير المضمون والصوت',
          body: 'صححوا الشرائح ونص السرد وكل مداخلة، ثم أعيدوا توليد الصوت المعتمد.',
        },
        {
          number: '04',
          title: 'النشر بالصيغة المناسبة',
          body: 'انشروا فصلا دائما قابلا للمشاركة، ثم صدروه بصيغة PPTX أو MP4 عند الحاجة.',
        },
      ],
    },
    agents: {
      eyebrow: 'فريق وليس شخصية رمزية',
      title: 'عشر آليات تربوية تمنح كل جلسة عمقا حقيقيا.',
      body: 'لكل وكيل وظيفة معرفية دقيقة. ويمكن ضبط اسمه وصورته وجنسه وصوته ووتيرة مداخلاته على مستوى المؤسسة.',
      settings: ['الاسم والصورة', 'صوت متوافق', 'وتيرة المداخلات', 'المستوى والفئة'],
      roster: [
        { role: 'الأستاذ', purpose: 'ينظم ويشرح ويتحقق من الفهم.' },
        { role: 'المساعدة التربوية', purpose: 'تعيد الصياغة وتخفف العبء المعرفي.' },
        { role: 'المرحة', purpose: 'تصنع رابطا لا ينسى بفكاهة مناسبة.' },
        { role: 'الفضولي', purpose: 'يطرح الأسئلة التي يتردد الآخرون في طرحها.' },
        { role: 'المقرر', purpose: 'يحوّل النقاش إلى خلاصات قابلة للتطبيق.' },
        { role: 'المفكرة', purpose: 'تربط الأفكار وتكشف آثارها.' },
        { role: 'المحلل', purpose: 'يختبر الادعاءات بالوقائع والمعايير.' },
        { role: 'المدربة', purpose: 'تحوّل الفهم إلى تطبيق.' },
        { role: 'محامي الشيطان', purpose: 'يقوي الاستدلال باعتراض وجيه.' },
        { role: 'المبدعة', purpose: 'تفتح مسارا غير متوقع وتحوله إلى تجربة.' },
      ],
    },
    studio: {
      eyebrow: 'استوديو قلم',
      title: 'الذكاء التوليدي يقترح، وخبرتكم هي التي تقرر.',
      body: 'لا ينبغي للمحتوى النهائي أن يبقى أسير التوليد الأول. يتيح لكم الاستوديو التدخل حيث تتحدد الجودة فعلا.',
      points: [
        {
          title: 'شرائح قابلة للتحرير',
          body: 'صححوا النصوص والمرئيات والتكوين مباشرة داخل مساحة العمل.',
        },
        {
          title: 'سرد مضبوط',
          body: 'أعيدوا كتابة ملاحظات التقديم وجدّدوا المداخلة الصوتية المعنية فقط.',
        },
        {
          title: 'أصوات ووسائط قابلة للضبط',
          body: 'اختاروا محركات الصوت والصورة والفيديو المعتمدة في بيئتكم.',
        },
        {
          title: 'مخرجات متسقة',
          body: 'يبقى الفصل والسرد والتصدير مرتبطا بالمادة التعليمية نفسها.',
        },
      ],
      canvasLabel: 'محرر الفصل',
      slideTitle: 'اتخاذ القرار في ظل عدم اليقين',
      slideBody: 'ثلاثة معايير تميز المخاطرة المقبولة عن الرهان الأعمى.',
      notesLabel: 'ملاحظات التقديم',
      notes: 'ابدؤوا بتكلفة عدم اتخاذ القرار، ثم قارنوا قابلية الرجوع وجودة الأدلة والوقت المتاح.',
      regenerate: 'إعادة توليد الصوت',
    },
    institutions: {
      eyebrow: 'النشر المؤسسي',
      title: 'وسعوا نطاق الجودة من دون جعل كل التكوينات متشابهة.',
      body: 'تمنح قلم الأكاديميات ومؤسسات التكوين وإدارات المواهب إطارا مشتركا لإنتاج التجارب وإدارتها ونشرها.',
      points: [
        'أعضاء المؤسسة وأدوارهم وإعداداتها',
        'مكتبة مشتركة وقوالب للفصول',
        'شخصيات وأصوات وكثافة تفاعل قابلة للضبط',
        'مسارات تعليمية وتقارير موحدة',
      ],
      cta: 'مناقشة مشروع النشر',
    },
    offers: {
      eyebrow: 'العروض التجارية',
      title: 'طريقتان لاقتناء قلم بحسب مستوى الحوكمة المطلوب.',
      body: 'يحدد النطاق قبل الالتزام لكي تتوافق النماذج والأحجام والاستضافة والمواكبة مع استخدامكم الفعلي.',
      studio: {
        name: 'قلم استوديو',
        audience: 'للفرق التي تصمم التكوينات وتنتجها.',
        price: 'وفق عرض تجاري',
        features: [
          'توليد موثق واستوديو للتحرير',
          'فصل تفاعلي بعشرة وكلاء',
          'سرد ووسائط وتصدير',
          'مواكبة الإطلاق',
        ],
        cta: 'طلب عرض قلم استوديو',
      },
      institution: {
        name: 'قلم للمؤسسات',
        audience: 'للنشر عبر فرق أو كيانات متعددة.',
        price: 'وفق عرض تجاري',
        features: [
          'جميع إمكانات الاستوديو',
          'إدارة المؤسسة',
          'المكتبة والمسارات والتقارير',
          'هندسة ومواكبة مخصصتان',
        ],
        cta: 'بناء عرض المؤسسة',
      },
      precision: 'يحدد كل عرض الإمكانات المفعلة والمسؤوليات والأحجام والدعم والشروط التجارية.',
    },
    closing: {
      eyebrow: 'إثبات على أرض الواقع',
      title: 'شاهدوا قلم وهي تعمل على موضوع مهم بالنسبة إليكم.',
      body: 'يعرض اللقاء التوضيحي السلسلة كاملة: المصادر والتصميم والوكلاء العشرة والأصوات والتحرير والنشر، من خلال حالة استخدام ممثلة لاحتياجكم.',
      primary: 'طلب عرض تجاري',
      secondary: 'حجز العرض التوضيحي',
    },
    footer: {
      promise: 'تجارب تعليمية حية وقابلة للتحرير والحوكمة.',
      product: 'المنتج',
      company: 'الشركة',
      legal: 'المعلومات القانونية',
      contact: 'التواصل',
      privacy: 'الخصوصية',
      terms: 'الشروط',
      rights: 'جميع الحقوق محفوظة.',
    },
  },
};
