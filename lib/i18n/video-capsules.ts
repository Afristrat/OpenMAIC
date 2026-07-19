/**
 * i18n — capsules vidéo Hyperframes (S1-006).
 *
 * Module dédié plutôt qu'ajouté à `lib/i18n/stage.ts` : ce dernier est listé
 * dans `refork/audit-provenance.json` sous `agpl_only_heritage` (purge en
 * attente, ADR-002 / S0-014) et ne doit pas être modifié tant qu'Amine n'a
 * pas tranché. Suit le même pattern d'export/merge que les autres modules
 * (voir lib/i18n/index.ts).
 */

export const videoCapsulesZhCN = {
  videoCapsule: {
    title: '视频片段（Hyperframes）',
    audience: '受众',
    tone: '语气',
    objective: '目标',
    duration: '时长（秒）',
    generate: '生成视频',
    noVariants: '没有可播放的视频',
    options: {
      etudiant: '学生',
      institution: '机构',
      investisseur: '投资者',
      grand_public: '大众',
      pairs_tech: '技术同行',
      interne: '内部',
      premium: '高端',
      insolent: '大胆',
      cinematic: '电影感',
      pedagogique: '教学',
      urgence: '紧迫',
      default: '默认',
      awareness: '认知',
      acquisition: '获客',
      proof: '证明',
      wrapped_shareable: '可分享总结',
      demo_day: '演示日',
    },
    status: {
      queued: '排队中...',
      generating: '生成中...',
      rendering: '渲染中...',
    },
  },
} as const;

export const videoCapsulesEnUS = {
  videoCapsule: {
    title: 'Video Capsule (Hyperframes)',
    audience: 'Audience',
    tone: 'Tone',
    objective: 'Objective',
    duration: 'Duration (seconds)',
    generate: 'Generate video',
    noVariants: 'No video available yet',
    options: {
      etudiant: 'Student',
      institution: 'Institution',
      investisseur: 'Investor',
      grand_public: 'General public',
      pairs_tech: 'Technical peers',
      interne: 'Internal',
      premium: 'Premium',
      insolent: 'Bold',
      cinematic: 'Cinematic',
      pedagogique: 'Educational',
      urgence: 'Urgent',
      default: 'Standard',
      awareness: 'Awareness',
      acquisition: 'Acquisition',
      proof: 'Proof',
      wrapped_shareable: 'Shareable recap',
      demo_day: 'Demo day',
    },
    status: {
      queued: 'Queued...',
      generating: 'Generating...',
      rendering: 'Rendering...',
    },
  },
} as const;

export const videoCapsulesFrFR = {
  videoCapsule: {
    title: 'Capsule vidéo (Hyperframes)',
    audience: 'Audience',
    tone: 'Ton',
    objective: 'Objectif',
    duration: 'Durée (secondes)',
    generate: 'Générer la vidéo',
    noVariants: 'Aucune vidéo disponible pour le moment',
    options: {
      etudiant: 'Étudiants',
      institution: 'Institutions',
      investisseur: 'Investisseurs',
      grand_public: 'Grand public',
      pairs_tech: 'Pairs techniques',
      interne: 'Interne',
      premium: 'Premium',
      insolent: 'Audacieux',
      cinematic: 'Cinématographique',
      pedagogique: 'Pédagogique',
      urgence: 'Urgent',
      default: 'Standard',
      awareness: 'Notoriété',
      acquisition: 'Acquisition',
      proof: 'Preuve',
      wrapped_shareable: 'Synthèse partageable',
      demo_day: 'Démonstration',
    },
    status: {
      queued: "En file d'attente...",
      generating: 'Génération en cours...',
      rendering: 'Rendu en cours...',
    },
  },
} as const;

export const videoCapsulesArMA = {
  videoCapsule: {
    title: 'كبسولة فيديو (Hyperframes)',
    audience: 'الجمهور المستهدف',
    tone: 'النبرة',
    objective: 'الهدف',
    duration: 'المدة (بالثواني)',
    generate: 'إنشاء الفيديو',
    noVariants: 'لا يوجد فيديو متاح بعد',
    options: {
      etudiant: 'الطلبة',
      institution: 'المؤسسات',
      investisseur: 'المستثمرون',
      grand_public: 'الجمهور العام',
      pairs_tech: 'الأقران التقنيون',
      interne: 'داخلي',
      premium: 'راقٍ',
      insolent: 'جريء',
      cinematic: 'سينمائي',
      pedagogique: 'تعليمي',
      urgence: 'عاجل',
      default: 'قياسي',
      awareness: 'الوعي',
      acquisition: 'الاستقطاب',
      proof: 'الإثبات',
      wrapped_shareable: 'ملخص قابل للمشاركة',
      demo_day: 'يوم العرض',
    },
    status: {
      queued: 'في قائمة الانتظار...',
      generating: 'جارٍ الإنشاء...',
      rendering: 'جارٍ المعالجة...',
    },
  },
} as const;
