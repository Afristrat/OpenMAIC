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
    status: {
      queued: 'في قائمة الانتظار...',
      generating: 'جارٍ الإنشاء...',
      rendering: 'جارٍ المعالجة...',
    },
  },
} as const;
