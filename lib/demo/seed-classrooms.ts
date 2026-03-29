/**
 * Demo Classrooms — Pre-built, playable classrooms that showcase Qalem's capabilities.
 *
 * Each classroom contains real, useful content (not lorem ipsum) in FR, AR, or EN.
 * Inserted into IndexedDB on first load via the useDemoSeed hook.
 *
 * Security note: The HTML content in interactive scenes and the innerHTML usage
 * within the self-contained HTML pages is static, developer-authored demo content —
 * not user-generated input. No sanitization risk applies.
 */

import type { StageRecord, SceneRecord } from '@/lib/utils/database';
import type { SlideContent, QuizContent, InteractiveContent } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { Slide, PPTTextElement, PPTShapeElement, SlideTheme } from '@/lib/types/slides';

// ─── Shared helpers ──────────────────────────────────────────────

const VIEWPORT_SIZE = 1000;
const VIEWPORT_RATIO = 0.5625; // 16:9

const THEME_FR: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#e0e7ff'],
  fontColor: '#1e293b',
  fontName: 'Inter',
};

const THEME_AR: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#059669', '#10b981', '#34d399', '#6ee7b7', '#d1fae5'],
  fontColor: '#1e293b',
  fontName: 'IBM Plex Sans Arabic',
};

const THEME_EN: SlideTheme = {
  backgroundColor: '#0f172a',
  themeColors: ['#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#60a5fa'],
  fontColor: '#f1f5f9',
  fontName: 'Inter',
};

function textEl(
  id: string,
  content: string,
  opts: {
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize?: string;
    bold?: boolean;
    color?: string;
    textType?: PPTTextElement['textType'];
    fill?: string;
    lineHeight?: number;
    defaultFontName?: string;
  },
): PPTTextElement {
  const fontSize = opts.fontSize ?? '18';
  const bold = opts.bold ? 'font-weight: bold;' : '';
  const color = opts.color ?? '';
  const colorStyle = color ? `color: ${color};` : '';
  return {
    id,
    type: 'text',
    left: opts.left,
    top: opts.top,
    width: opts.width,
    height: opts.height,
    rotate: 0,
    content: `<p style="font-size: ${fontSize}px; ${bold} ${colorStyle}">${content}</p>`,
    defaultFontName: opts.defaultFontName ?? 'Inter',
    defaultColor: opts.color ?? '#1e293b',
    textType: opts.textType,
    fill: opts.fill,
    lineHeight: opts.lineHeight ?? 1.5,
  };
}

function shapeEl(
  id: string,
  opts: {
    left: number;
    top: number;
    width: number;
    height: number;
    fill: string;
    opacity?: number;
  },
): PPTShapeElement {
  return {
    id,
    type: 'shape',
    left: opts.left,
    top: opts.top,
    width: opts.width,
    height: opts.height,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fixedRatio: false,
    fill: opts.fill,
    opacity: opts.opacity ?? 1,
  };
}

function makeSlide(
  id: string,
  theme: SlideTheme,
  elements: (PPTTextElement | PPTShapeElement)[],
  bgColor?: string,
): Slide {
  return {
    id,
    viewportSize: VIEWPORT_SIZE,
    viewportRatio: VIEWPORT_RATIO,
    theme,
    elements,
    background: { type: 'solid', color: bgColor ?? theme.backgroundColor },
  };
}

function speechAction(id: string, text: string, speed?: number): Action {
  return { id, type: 'speech', text, speed: speed ?? 1 };
}

function spotlightAction(id: string, elementId: string): Action {
  return { id, type: 'spotlight', elementId };
}

// ─── DEMO 1 — Marketing Digital pour Startups (FR) ───────────────

const DEMO1_STAGE_ID = 'demo-marketing-digital-fr';

const demo1Stage: StageRecord = {
  id: DEMO1_STAGE_ID,
  name: 'Marketing Digital pour Startups',
  description:
    'Formation compl\u00e8te en marketing digital adapt\u00e9e aux startups du Maroc et d\'Afrique du Nord. 4 sc\u00e8nes interactives couvrant la strat\u00e9gie, les fondamentaux et un plan d\'action concret sur 90 jours.',
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
  language: 'fr-FR',
  style: 'professional',
};

// Scene 1 — Slides: Pourquoi le digital change tout
const demo1Scene1Slides: Slide[] = [
  makeSlide('d1s1-slide1', THEME_FR, [
    shapeEl('d1s1-s1-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#6366f1', opacity: 0.08 }),
    textEl('d1s1-s1-title', 'Pourquoi le digital change tout', {
      left: 80, top: 60, width: 840, height: 80,
      fontSize: '36', bold: true, color: '#6366f1', textType: 'title',
    }),
    textEl('d1s1-s1-subtitle', 'Le paysage num\u00e9rique en Afrique du Nord en 2026', {
      left: 80, top: 150, width: 840, height: 40,
      fontSize: '20', color: '#64748b', textType: 'subtitle',
    }),
    textEl('d1s1-s1-stat1', '<strong>78 % de p\u00e9n\u00e9tration mobile</strong> au Maroc \u2014 le smartphone est le premier \u00e9cran', {
      left: 80, top: 230, width: 840, height: 50,
      fontSize: '18', color: '#1e293b',
    }),
    textEl('d1s1-s1-stat2', '<strong>+42 % de croissance e-commerce</strong> en Afrique du Nord depuis 2024', {
      left: 80, top: 290, width: 840, height: 50,
      fontSize: '18', color: '#1e293b',
    }),
    textEl('d1s1-s1-stat3', '<strong>Co\u00fbt d\'acquisition 5x moins cher</strong> qu\'en marketing traditionnel', {
      left: 80, top: 350, width: 840, height: 50,
      fontSize: '18', color: '#1e293b',
    }),
    textEl('d1s1-s1-takeaway', 'Le digital n\'est plus une option : c\'est le canal principal pour atteindre vos clients.', {
      left: 80, top: 440, width: 840, height: 60,
      fontSize: '20', bold: true, color: '#6366f1',
      fill: '#eef2ff', lineHeight: 1.6,
    }),
  ]),
  makeSlide('d1s1-slide2', THEME_FR, [
    shapeEl('d1s1-s2-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#8b5cf6', opacity: 0.06 }),
    textEl('d1s1-s2-title', 'Les 4 piliers du marketing digital', {
      left: 80, top: 50, width: 840, height: 70,
      fontSize: '32', bold: true, color: '#6366f1', textType: 'title',
    }),
    textEl('d1s1-s2-p1', '<strong>SEO & Contenu</strong><br/>Cr\u00e9ez du contenu qui r\u00e9pond aux recherches de vos clients. Blog, vid\u00e9os, guides \u2014 soyez la r\u00e9ponse \u00e0 leurs questions.', {
      left: 80, top: 140, width: 380, height: 120,
      fontSize: '15', color: '#334155',
    }),
    textEl('d1s1-s2-p2', '<strong>R\u00e9seaux sociaux</strong><br/>Instagram, TikTok, LinkedIn \u2014 choisissez 2 plateformes max et publiez r\u00e9guli\u00e8rement. La constance bat la perfection.', {
      left: 520, top: 140, width: 400, height: 120,
      fontSize: '15', color: '#334155',
    }),
    textEl('d1s1-s2-p3', '<strong>Email marketing</strong><br/>Le canal avec le meilleur ROI (36 MAD pour 1 MAD investi). Construisez votre liste d\u00e8s le jour 1.', {
      left: 80, top: 310, width: 380, height: 120,
      fontSize: '15', color: '#334155',
    }),
    textEl('d1s1-s2-p4', '<strong>Publicit\u00e9 cibl\u00e9e</strong><br/>Meta Ads et Google Ads permettent de cibler pr\u00e9cis\u00e9ment vos clients id\u00e9aux avec un budget de 50 MAD/jour.', {
      left: 520, top: 310, width: 400, height: 120,
      fontSize: '15', color: '#334155',
    }),
    textEl('d1s1-s2-footer', 'Ma\u00eetriser ces 4 piliers = 80 % de votre strat\u00e9gie digitale', {
      left: 80, top: 480, width: 840, height: 40,
      fontSize: '16', bold: true, color: '#8b5cf6',
    }),
  ]),
  makeSlide('d1s1-slide3', THEME_FR, [
    shapeEl('d1s1-s3-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#6366f1', opacity: 0.05 }),
    textEl('d1s1-s3-title', 'Erreurs fatales \u00e0 \u00e9viter', {
      left: 80, top: 50, width: 840, height: 70,
      fontSize: '32', bold: true, color: '#dc2626', textType: 'title',
    }),
    textEl('d1s1-s3-e1', '<strong>\u00catre partout \u00e0 la fois</strong><br/>Mieux vaut 2 canaux bien g\u00e9r\u00e9s que 6 canaux abandonn\u00e9s apr\u00e8s 2 semaines.', {
      left: 80, top: 150, width: 840, height: 70,
      fontSize: '17', color: '#334155',
    }),
    textEl('d1s1-s3-e2', '<strong>Copier les grandes marques</strong><br/>Vous n\'avez pas le budget de Coca-Cola. Misez sur l\'authenticit\u00e9 et la proximit\u00e9 avec votre audience.', {
      left: 80, top: 240, width: 840, height: 70,
      fontSize: '17', color: '#334155',
    }),
    textEl('d1s1-s3-e3', '<strong>Ignorer les donn\u00e9es</strong><br/>Chaque campagne doit \u00eatre mesur\u00e9e. Pas de donn\u00e9es = pas d\'am\u00e9lioration. Installez Google Analytics d\u00e8s le jour 1.', {
      left: 80, top: 330, width: 840, height: 70,
      fontSize: '17', color: '#334155',
    }),
    textEl('d1s1-s3-takeaway', 'La r\u00e8gle d\'or : tester, mesurer, ajuster. Chaque semaine.', {
      left: 80, top: 440, width: 840, height: 60,
      fontSize: '20', bold: true, color: '#059669',
      fill: '#ecfdf5', lineHeight: 1.6,
    }),
  ]),
];

const demo1Scene1Actions: Action[] = [
  speechAction('d1s1-a1', 'Bienvenue dans cette formation sur le marketing digital pour startups. Le paysage num\u00e9rique en Afrique du Nord a radicalement chang\u00e9 ces derni\u00e8res ann\u00e9es. Avec 78 pour cent de p\u00e9n\u00e9tration mobile au Maroc, le digital est devenu le canal principal pour toucher vos clients.'),
  spotlightAction('d1s1-a2', 'd1s1-s1-stat1'),
  speechAction('d1s1-a3', 'Le e-commerce a connu une croissance de 42 pour cent, et le co\u00fbt d\'acquisition client en ligne est 5 fois moins cher qu\'en marketing traditionnel. C\'est une opportunit\u00e9 immense pour les startups.'),
  spotlightAction('d1s1-a4', 'd1s1-s1-takeaway'),
];

const demo1Scene1: SceneRecord = {
  id: 'demo-fr-scene-1',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Pourquoi le digital change tout',
  order: 0,
  content: { type: 'slide', canvas: demo1Scene1Slides[0] } as SlideContent,
  actions: demo1Scene1Actions,
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

const demo1Scene1b: SceneRecord = {
  id: 'demo-fr-scene-1b',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Les 4 piliers du marketing digital',
  order: 1,
  content: { type: 'slide', canvas: demo1Scene1Slides[1] } as SlideContent,
  actions: [
    speechAction('d1s1b-a1', 'Parlons maintenant des quatre piliers du marketing digital. Le SEO et le contenu pour \u00eatre trouv\u00e9. Les r\u00e9seaux sociaux pour cr\u00e9er une communaut\u00e9. L\'email marketing, qui reste le canal avec le meilleur retour sur investissement. Et la publicit\u00e9 cibl\u00e9e pour acc\u00e9l\u00e9rer votre croissance.'),
    spotlightAction('d1s1b-a2', 'd1s1-s2-p1'),
    spotlightAction('d1s1b-a3', 'd1s1-s2-p3'),
    speechAction('d1s1b-a4', 'L\'email marketing rapporte en moyenne 36 dirhams pour chaque dirham investi. Commencez \u00e0 construire votre liste d\'emails d\u00e8s le premier jour.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

const demo1Scene1c: SceneRecord = {
  id: 'demo-fr-scene-1c',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Erreurs fatales \u00e0 \u00e9viter',
  order: 2,
  content: { type: 'slide', canvas: demo1Scene1Slides[2] } as SlideContent,
  actions: [
    speechAction('d1s1c-a1', 'Attention aux erreurs fatales que commettent la plupart des startups. \u00catre partout \u00e0 la fois, copier les grandes marques sans avoir leur budget, et ignorer les donn\u00e9es. La r\u00e8gle d\'or, c\'est de tester, mesurer et ajuster chaque semaine.'),
    spotlightAction('d1s1c-a2', 'd1s1-s3-takeaway'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

// Scene 2 — Quiz
const demo1Scene2: SceneRecord = {
  id: 'demo-fr-scene-2',
  stageId: DEMO1_STAGE_ID,
  type: 'quiz',
  title: 'Quiz \u2014 Fondamentaux du marketing digital',
  order: 3,
  content: {
    type: 'quiz',
    questions: [
      {
        id: 'q1-fr',
        type: 'single',
        question: 'Quel est le canal digital avec le meilleur retour sur investissement (ROI) pour une startup ?',
        options: [
          { label: 'TikTok Ads', value: 'A' },
          { label: 'Email marketing', value: 'B' },
          { label: 'Affichage publicitaire en ligne', value: 'C' },
          { label: 'Marketing d\'influence', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'L\'email marketing offre en moyenne un ROI de 36:1, ce qui en fait le canal le plus rentable. Contrairement aux r\u00e9seaux sociaux, vous \u00eates propri\u00e9taire de votre liste d\'emails \u2014 aucun algorithme ne peut r\u00e9duire votre port\u00e9e.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q2-fr',
        type: 'single',
        question: 'Combien de plateformes de r\u00e9seaux sociaux une startup devrait-elle g\u00e9rer activement au d\u00e9marrage ?',
        options: [
          { label: '1 seule pour maximiser l\'impact', value: 'A' },
          { label: '2 \u00e0 3 maximum, bien choisies', value: 'B' },
          { label: 'Toutes les plateformes disponibles', value: 'C' },
          { label: 'Uniquement LinkedIn', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'Se concentrer sur 2 \u00e0 3 plateformes permet de maintenir une pr\u00e9sence constante et qualitative. \u00catre partout \u00e0 la fois dilue les efforts et m\u00e8ne souvent \u00e0 l\'abandon apr\u00e8s quelques semaines.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q3-fr',
        type: 'short_answer',
        question: 'Qu\'est-ce que le SEO et pourquoi est-il important pour une startup avec un budget limit\u00e9 ?',
        commentPrompt: 'Le candidat doit mentionner que le SEO (Search Engine Optimization / R\u00e9f\u00e9rencement naturel) permet d\'obtenir du trafic organique gratuit depuis les moteurs de recherche, ce qui est crucial pour une startup qui ne peut pas d\u00e9pendre uniquement de la publicit\u00e9 payante.',
        analysis: 'Le SEO (r\u00e9f\u00e9rencement naturel) consiste \u00e0 optimiser votre site web pour appara\u00eetre dans les r\u00e9sultats de recherche Google. C\'est crucial pour les startups car le trafic organique est gratuit et durable \u2014 contrairement \u00e0 la publicit\u00e9 qui s\'arr\u00eate d\u00e8s que vous coupez le budget.',
        hasAnswer: false,
        points: 3,
      },
      {
        id: 'q4-fr',
        type: 'single',
        question: 'Quel est le taux de p\u00e9n\u00e9tration mobile au Maroc en 2026 ?',
        options: [
          { label: '45 %', value: 'A' },
          { label: '62 %', value: 'B' },
          { label: '78 %', value: 'C' },
          { label: '91 %', value: 'D' },
        ],
        answer: ['C'],
        analysis: 'Avec 78 % de p\u00e9n\u00e9tration mobile, le Maroc est l\'un des march\u00e9s les plus connect\u00e9s d\'Afrique du Nord. Cela signifie que votre strat\u00e9gie digitale doit \u00eatre \u00ab mobile-first \u00bb \u2014 votre site et vos contenus doivent \u00eatre optimis\u00e9s pour les smartphones.',
        hasAnswer: true,
        points: 1,
      },
      {
        id: 'q5-fr',
        type: 'single',
        question: 'Quel outil devez-vous installer en premier sur votre site web ?',
        options: [
          { label: 'Un chatbot IA', value: 'A' },
          { label: 'Google Analytics', value: 'B' },
          { label: 'Un pop-up de r\u00e9duction', value: 'C' },
          { label: 'Un widget de r\u00e9seaux sociaux', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'Google Analytics est indispensable d\u00e8s le jour 1. Sans mesure, vous ne pouvez pas savoir ce qui fonctionne. Chaque d\u00e9cision marketing doit \u00eatre guid\u00e9e par les donn\u00e9es, pas par l\'intuition.',
        hasAnswer: true,
        points: 2,
      },
    ],
  } as QuizContent,
  actions: [
    speechAction('d1s2-a1', 'Testons maintenant vos connaissances sur les fondamentaux du marketing digital. Ce quiz comporte 5 questions m\u00ealant choix unique et r\u00e9ponse courte. Prenez votre temps pour r\u00e9fl\u00e9chir \u00e0 chaque question.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

// Scene 3 — Interactive: Marketing Budget Calculator
const BUDGET_CALCULATOR_HTML = `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Calculateur de budget marketing</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
    color: #1e293b;
    min-height: 100vh;
    padding: 24px;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1 {
    font-size: 26px; font-weight: 700; color: #6366f1;
    margin-bottom: 6px;
  }
  .subtitle { font-size: 14px; color: #64748b; margin-bottom: 28px; }
  .card {
    background: white; border-radius: 16px; padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    margin-bottom: 20px;
  }
  .card h2 { font-size: 17px; font-weight: 600; color: #334155; margin-bottom: 16px; }
  .input-group { margin-bottom: 16px; }
  .input-group label {
    display: block; font-size: 13px; font-weight: 500; color: #475569;
    margin-bottom: 6px;
  }
  .input-row { display: flex; align-items: center; gap: 10px; }
  input[type="range"] {
    flex: 1; height: 6px; -webkit-appearance: none; appearance: none;
    background: #e2e8f0; border-radius: 4px; outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%;
    background: #6366f1; cursor: pointer; border: 3px solid white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  .value-badge {
    min-width: 72px; text-align: center; font-size: 14px; font-weight: 600;
    color: #6366f1; background: #eef2ff; padding: 6px 12px;
    border-radius: 8px;
  }
  .total-input {
    width: 100%; padding: 10px 14px; font-size: 16px; font-weight: 600;
    border: 2px solid #e2e8f0; border-radius: 10px; outline: none;
    transition: border-color 0.2s;
  }
  .total-input:focus { border-color: #6366f1; }
  .results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .result-card {
    padding: 16px; border-radius: 12px; text-align: center;
  }
  .result-card .label { font-size: 12px; font-weight: 500; opacity: 0.8; margin-bottom: 4px; }
  .result-card .amount { font-size: 22px; font-weight: 700; }
  .result-card .roi { font-size: 13px; margin-top: 4px; opacity: 0.7; }
  .seo { background: #ecfdf5; color: #059669; }
  .social { background: #eff6ff; color: #2563eb; }
  .email { background: #fef3c7; color: #d97706; }
  .ads { background: #fce7f3; color: #db2777; }
  .tip {
    margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 12px;
    border-left: 4px solid #22c55e; font-size: 14px; color: #166534;
  }
  .bar-chart { margin-top: 16px; }
  .bar-row { display: flex; align-items: center; margin-bottom: 8px; gap: 10px; }
  .bar-label { width: 80px; font-size: 13px; font-weight: 500; color: #475569; }
  .bar-track { flex: 1; height: 24px; background: #f1f5f9; border-radius: 6px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; transition: width 0.4s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 11px; font-weight: 600; color: white; }
</style>
</head>
<body>
<div class="container">
  <h1>Calculateur de budget marketing</h1>
  <p class="subtitle">R\u00e9partissez votre budget et estimez le ROI par canal</p>

  <div class="card">
    <h2>Budget mensuel total (MAD)</h2>
    <input type="number" class="total-input" id="totalBudget" value="5000" min="500" step="500">
  </div>

  <div class="card">
    <h2>R\u00e9partition par canal</h2>
    <div class="input-group">
      <label>SEO & Contenu</label>
      <div class="input-row">
        <input type="range" id="seoSlider" min="0" max="100" value="25">
        <span class="value-badge" id="seoValue">25 %</span>
      </div>
    </div>
    <div class="input-group">
      <label>R\u00e9seaux sociaux</label>
      <div class="input-row">
        <input type="range" id="socialSlider" min="0" max="100" value="25">
        <span class="value-badge" id="socialValue">25 %</span>
      </div>
    </div>
    <div class="input-group">
      <label>Email marketing</label>
      <div class="input-row">
        <input type="range" id="emailSlider" min="0" max="100" value="25">
        <span class="value-badge" id="emailValue">25 %</span>
      </div>
    </div>
    <div class="input-group">
      <label>Publicit\u00e9 (Meta/Google Ads)</label>
      <div class="input-row">
        <input type="range" id="adsSlider" min="0" max="100" value="25">
        <span class="value-badge" id="adsValue">25 %</span>
      </div>
    </div>

    <div class="bar-chart" id="barChart"></div>
  </div>

  <div class="card">
    <h2>Estimations de ROI mensuel</h2>
    <div class="results-grid">
      <div class="result-card seo">
        <div class="label">SEO & Contenu</div>
        <div class="amount" id="seoROI">\u2014</div>
        <div class="roi">ROI moyen : x8 (6-12 mois)</div>
      </div>
      <div class="result-card social">
        <div class="label">R\u00e9seaux sociaux</div>
        <div class="amount" id="socialROI">\u2014</div>
        <div class="roi">ROI moyen : x4</div>
      </div>
      <div class="result-card email">
        <div class="label">Email marketing</div>
        <div class="amount" id="emailROI">\u2014</div>
        <div class="roi">ROI moyen : x36</div>
      </div>
      <div class="result-card ads">
        <div class="label">Publicit\u00e9 cibl\u00e9e</div>
        <div class="amount" id="adsROI">\u2014</div>
        <div class="roi">ROI moyen : x3</div>
      </div>
    </div>
    <div class="tip" id="tip"></div>
  </div>
</div>

<script>
(function() {
  var sliders = ['seoSlider', 'socialSlider', 'emailSlider', 'adsSlider'];

  function getEl(id) { return document.getElementById(id); }

  function rebalance(changedId) {
    var total = 0;
    for (var i = 0; i < sliders.length; i++) total += parseInt(getEl(sliders[i]).value);
    if (total > 100) {
      var el = getEl(changedId);
      el.value = parseInt(el.value) - (total - 100);
    }
  }

  function fmt(n) { return n.toLocaleString('fr-FR') + ' MAD'; }

  function calculate() {
    var budget = parseInt(getEl('totalBudget').value) || 0;
    var seo = parseInt(getEl('seoSlider').value);
    var social = parseInt(getEl('socialSlider').value);
    var email = parseInt(getEl('emailSlider').value);
    var ads = parseInt(getEl('adsSlider').value);

    getEl('seoValue').textContent = seo + ' %';
    getEl('socialValue').textContent = social + ' %';
    getEl('emailValue').textContent = email + ' %';
    getEl('adsValue').textContent = ads + ' %';

    var seoBudget = Math.round(budget * seo / 100);
    var socialBudget = Math.round(budget * social / 100);
    var emailBudget = Math.round(budget * email / 100);
    var adsBudget = Math.round(budget * ads / 100);

    var seoRoi = seoBudget * 8;
    var socialRoi = socialBudget * 4;
    var emailRoi = emailBudget * 36;
    var adsRoi = adsBudget * 3;

    getEl('seoROI').textContent = fmt(seoRoi);
    getEl('socialROI').textContent = fmt(socialRoi);
    getEl('emailROI').textContent = fmt(emailRoi);
    getEl('adsROI').textContent = fmt(adsRoi);

    // Bar chart — built via DOM methods for safety
    var maxRoi = Math.max(seoRoi, socialRoi, emailRoi, adsRoi, 1);
    var bars = [
      { label: 'SEO', value: seoRoi, color: '#059669' },
      { label: 'Social', value: socialRoi, color: '#2563eb' },
      { label: 'Email', value: emailRoi, color: '#d97706' },
      { label: 'Ads', value: adsRoi, color: '#db2777' },
    ];
    var chart = getEl('barChart');
    chart.textContent = '';
    for (var i = 0; i < bars.length; i++) {
      var row = document.createElement('div'); row.className = 'bar-row';
      var lbl = document.createElement('span'); lbl.className = 'bar-label'; lbl.textContent = bars[i].label;
      var track = document.createElement('div'); track.className = 'bar-track';
      var fill = document.createElement('div'); fill.className = 'bar-fill';
      fill.style.width = Math.max(2, bars[i].value / maxRoi * 100) + '%';
      fill.style.background = bars[i].color;
      fill.textContent = fmt(bars[i].value);
      track.appendChild(fill); row.appendChild(lbl); row.appendChild(track);
      chart.appendChild(row);
    }

    var totalRoi = seoRoi + socialRoi + emailRoi + adsRoi;
    var tipEl = getEl('tip');
    if (email < 15) tipEl.textContent = 'Conseil : augmentez la part email marketing — c\\'est le canal avec le meilleur ROI (x36). M\\u00eame 15 % de votre budget peut g\\u00e9n\\u00e9rer des r\\u00e9sultats significatifs.';
    else if (seo < 10) tipEl.textContent = 'Conseil : le SEO est un investissement \\u00e0 long terme. Consacrez-y au moins 15 % pour des r\\u00e9sultats durables en 6-12 mois.';
    else tipEl.textContent = 'Bonne r\\u00e9partition ! ROI total estim\\u00e9 : ' + fmt(totalRoi) + ' par mois, soit un retour de x' + (budget > 0 ? (totalRoi / budget).toFixed(1) : '0') + '.';
  }

  for (var i = 0; i < sliders.length; i++) {
    (function(sid) {
      getEl(sid).addEventListener('input', function() { rebalance(sid); calculate(); });
    })(sliders[i]);
  }
  getEl('totalBudget').addEventListener('input', calculate);

  calculate();
})();
</script>
</body>
</html>`;

const demo1Scene3: SceneRecord = {
  id: 'demo-fr-scene-3',
  stageId: DEMO1_STAGE_ID,
  type: 'interactive',
  title: 'Calculateur de budget marketing',
  order: 4,
  content: {
    type: 'interactive',
    url: '',
    html: BUDGET_CALCULATOR_HTML,
  } as InteractiveContent,
  actions: [
    speechAction('d1s3-a1', 'Passons \u00e0 la pratique avec ce calculateur de budget marketing. Ajustez les curseurs pour r\u00e9partir votre budget entre les quatre canaux principaux et observez les estimations de retour sur investissement. N\'oubliez pas que l\'email marketing offre le meilleur ROI.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

// Scene 4 — Slides: Plan d'action 90 jours
const demo1Scene4Slides = {
  month1: makeSlide('d1s4-slide1', THEME_FR, [
    shapeEl('d1s4-s1-accent', { left: 0, top: 0, width: 8, height: 562, fill: '#6366f1' }),
    textEl('d1s4-s1-badge', 'MOIS 1', {
      left: 80, top: 40, width: 120, height: 36,
      fontSize: '14', bold: true, color: '#ffffff',
      fill: '#6366f1',
    }),
    textEl('d1s4-s1-title', 'Fondations & lancement', {
      left: 80, top: 90, width: 840, height: 50,
      fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
    }),
    textEl('d1s4-s1-tasks', '<strong>Semaine 1-2 :</strong><br/>Cr\u00e9er votre site web (WordPress ou Framer) avec une page de capture d\'emails<br/>Installer Google Analytics et configurer les objectifs de conversion<br/>Choisir 2 r\u00e9seaux sociaux (Instagram + LinkedIn recommand\u00e9s)<br/><br/><strong>Semaine 3-4 :</strong><br/>Publier 8 posts sur les r\u00e9seaux sociaux (2/semaine)<br/>\u00c9crire 2 articles de blog optimis\u00e9s SEO<br/>Configurer votre outil d\'email marketing (Mailchimp ou Brevo)<br/>Lancer une campagne de bienvenue automatis\u00e9e', {
      left: 80, top: 155, width: 840, height: 350,
      fontSize: '15', color: '#334155', lineHeight: 1.7,
    }),
    textEl('d1s4-s1-kpi', 'KPI : 100 visiteurs/mois, 20 abonn\u00e9s email, 50 followers', {
      left: 80, top: 500, width: 840, height: 40,
      fontSize: '14', bold: true, color: '#6366f1', fill: '#eef2ff',
    }),
  ]),
  month2: makeSlide('d1s4-slide2', THEME_FR, [
    shapeEl('d1s4-s2-accent', { left: 0, top: 0, width: 8, height: 562, fill: '#8b5cf6' }),
    textEl('d1s4-s2-badge', 'MOIS 2', {
      left: 80, top: 40, width: 120, height: 36,
      fontSize: '14', bold: true, color: '#ffffff',
      fill: '#8b5cf6',
    }),
    textEl('d1s4-s2-title', 'Acc\u00e9l\u00e9ration & premiers r\u00e9sultats', {
      left: 80, top: 90, width: 840, height: 50,
      fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
    }),
    textEl('d1s4-s2-tasks', '<strong>Semaine 5-6 :</strong><br/>Lancer votre premi\u00e8re campagne Meta Ads (budget : 50 MAD/jour)<br/>Cr\u00e9er un lead magnet gratuit (guide PDF, checklist, mini-cours)<br/>Analyser les donn\u00e9es du mois 1 et ajuster la strat\u00e9gie<br/><br/><strong>Semaine 7-8 :</strong><br/>Collaborer avec 2-3 micro-influenceurs locaux<br/>Envoyer 2 newsletters \u00e0 votre liste email<br/>Publier 8 posts suppl\u00e9mentaires (tester les Reels/vid\u00e9os courtes)<br/>A/B tester vos publicit\u00e9s (2 variantes minimum)', {
      left: 80, top: 155, width: 840, height: 350,
      fontSize: '15', color: '#334155', lineHeight: 1.7,
    }),
    textEl('d1s4-s2-kpi', 'KPI : 500 visiteurs/mois, 100 abonn\u00e9s email, 200 followers', {
      left: 80, top: 500, width: 840, height: 40,
      fontSize: '14', bold: true, color: '#8b5cf6', fill: '#f3f0ff',
    }),
  ]),
  month3: makeSlide('d1s4-slide3', THEME_FR, [
    shapeEl('d1s4-s3-accent', { left: 0, top: 0, width: 8, height: 562, fill: '#059669' }),
    textEl('d1s4-s3-badge', 'MOIS 3', {
      left: 80, top: 40, width: 120, height: 36,
      fontSize: '14', bold: true, color: '#ffffff',
      fill: '#059669',
    }),
    textEl('d1s4-s3-title', 'Optimisation & scale', {
      left: 80, top: 90, width: 840, height: 50,
      fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
    }),
    textEl('d1s4-s3-tasks', '<strong>Semaine 9-10 :</strong><br/>Doubler le budget des publicit\u00e9s qui fonctionnent (ROAS > 3x)<br/>Cr\u00e9er une s\u00e9quence email de nurturing (5 emails automatis\u00e9s)<br/>Optimiser le SEO : ajouter des liens internes, am\u00e9liorer la vitesse du site<br/><br/><strong>Semaine 11-12 :</strong><br/>Lancer un programme de parrainage (recommandation client)<br/>Produire une \u00e9tude de cas client ou un t\u00e9moignage vid\u00e9o<br/>Cr\u00e9er un tableau de bord marketing (Google Data Studio)<br/>Planifier la strat\u00e9gie du trimestre 2 bas\u00e9e sur les donn\u00e9es', {
      left: 80, top: 155, width: 840, height: 350,
      fontSize: '15', color: '#334155', lineHeight: 1.7,
    }),
    textEl('d1s4-s3-kpi', 'KPI : 2 000 visiteurs/mois, 500 abonn\u00e9s email, 1 000 followers, premiers clients', {
      left: 80, top: 500, width: 840, height: 40,
      fontSize: '14', bold: true, color: '#059669', fill: '#ecfdf5',
    }),
  ]),
};

const demo1Scene4a: SceneRecord = {
  id: 'demo-fr-scene-4a',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Mois 1 \u2014 Fondations & lancement',
  order: 5,
  content: { type: 'slide', canvas: demo1Scene4Slides.month1 } as SlideContent,
  actions: [
    speechAction('d1s4a-a1', 'Voici votre plan d\'action sur 90 jours. Le premier mois est consacr\u00e9 aux fondations : cr\u00e9er votre site web, installer les outils d\'analyse, et \u00e9tablir votre pr\u00e9sence sur les r\u00e9seaux sociaux. L\'objectif est d\'atteindre 100 visiteurs et 20 abonn\u00e9s email.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

const demo1Scene4b: SceneRecord = {
  id: 'demo-fr-scene-4b',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Mois 2 \u2014 Acc\u00e9l\u00e9ration',
  order: 6,
  content: { type: 'slide', canvas: demo1Scene4Slides.month2 } as SlideContent,
  actions: [
    speechAction('d1s4b-a1', 'Le deuxi\u00e8me mois, on acc\u00e9l\u00e8re. Vous lancez vos premi\u00e8res publicit\u00e9s avec un budget modeste de 50 dirhams par jour. Vous cr\u00e9ez un lead magnet pour capturer des emails, et vous testez les collaborations avec des micro-influenceurs locaux.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

const demo1Scene4c: SceneRecord = {
  id: 'demo-fr-scene-4c',
  stageId: DEMO1_STAGE_ID,
  type: 'slide',
  title: 'Mois 3 \u2014 Optimisation & scale',
  order: 7,
  content: { type: 'slide', canvas: demo1Scene4Slides.month3 } as SlideContent,
  actions: [
    speechAction('d1s4c-a1', 'Le troisi\u00e8me mois est celui de l\'optimisation. Doublez le budget des campagnes rentables, cr\u00e9ez des s\u00e9quences d\'email automatis\u00e9es, et lancez un programme de parrainage. \u00c0 la fin des 90 jours, vous devriez avoir 2 000 visiteurs mensuels et vos premiers clients.'),
  ],
  createdAt: Date.now() - 86400000 * 3,
  updatedAt: Date.now() - 86400000 * 3,
};

// ─── DEMO 2 — أساسيات ريادة الأعمال (AR) ────────────────────────

const DEMO2_STAGE_ID = 'demo-entrepreneurship-ar';

const demo2Stage: StageRecord = {
  id: DEMO2_STAGE_ID,
  name: '\u0623\u0633\u0627\u0633\u064a\u0627\u062a \u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644',
  description: '\u0645\u0642\u062f\u0645\u0629 \u0634\u0627\u0645\u0644\u0629 \u0641\u064a \u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0645\u0648\u062c\u0647\u0629 \u0644\u0644\u0634\u0628\u0627\u0628 \u0641\u064a \u0634\u0645\u0627\u0644 \u0623\u0641\u0631\u064a\u0642\u064a\u0627 \u0648\u0627\u0644\u0634\u0631\u0642 \u0627\u0644\u0623\u0648\u0633\u0637. \u062a\u063a\u0637\u064a \u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u062d\u0627\u0644\u064a\u0629\u060c \u0645\u0646\u0647\u062c\u064a\u0629 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0627\u0644\u0631\u0634\u064a\u0642\u0629\u060c \u0648\u062e\u0637\u0648\u0627\u062a \u0639\u0645\u0644\u064a\u0629 \u0644\u0644\u0627\u0646\u0637\u0644\u0627\u0642.',
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
  language: 'ar-MA',
  style: 'professional',
};

// Scene 1 — Slides: لماذا الآن؟
const demo2Scene1a: SceneRecord = {
  id: 'demo-ar-scene-1a',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0644\u0645\u0627\u0630\u0627 \u0627\u0644\u0622\u0646\u061f \u2014 \u0627\u0644\u0641\u0631\u0635\u0629 \u0627\u0644\u062a\u0627\u0631\u064a\u062e\u064a\u0629',
  order: 0,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s1-slide1', THEME_AR, [
      shapeEl('d2s1-s1-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#059669', opacity: 0.07 }),
      textEl('d2s1-s1-title', '\u0644\u0645\u0627\u0630\u0627 \u0627\u0644\u0622\u0646 \u0647\u0648 \u0623\u0641\u0636\u0644 \u0648\u0642\u062a \u0644\u0644\u0628\u062f\u0621\u061f', {
        left: 80, top: 50, width: 840, height: 70,
        fontSize: '34', bold: true, color: '#059669', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s1-stat1', '<strong>\u0623\u0643\u062b\u0631 \u0645\u0646 60% \u0645\u0646 \u0633\u0643\u0627\u0646 \u0634\u0645\u0627\u0644 \u0623\u0641\u0631\u064a\u0642\u064a\u0627 \u062a\u062d\u062a \u0633\u0646 30</strong> \u2014 \u062c\u064a\u0644 \u0631\u0642\u0645\u064a \u0628\u0627\u0644\u0643\u0627\u0645\u0644', {
        left: 80, top: 160, width: 840, height: 50,
        fontSize: '18', color: '#1e293b', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s1-stat2', '<strong>\u0646\u0645\u0648 \u0627\u0644\u062a\u0645\u0648\u064a\u0644 \u0644\u0640 startups \u0623\u0641\u0631\u064a\u0642\u064a\u0627 +35% \u0633\u0646\u0648\u064a\u0627\u064b</strong> \u0645\u0646\u0630 2023', {
        left: 80, top: 230, width: 840, height: 50,
        fontSize: '18', color: '#1e293b', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s1-stat3', '<strong>\u062a\u0643\u0644\u0641\u0629 \u0625\u0637\u0644\u0627\u0642 \u0645\u0634\u0631\u0648\u0639 \u0631\u0642\u0645\u064a \u0627\u0646\u062e\u0641\u0636\u062a 10 \u0645\u0631\u0627\u062a</strong> \u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0639\u0627\u0645 2015', {
        left: 80, top: 300, width: 840, height: 50,
        fontSize: '18', color: '#1e293b', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s1-takeaway', '\u0627\u0644\u0641\u0631\u0635\u0629 \u062d\u0642\u064a\u0642\u064a\u0629. \u0627\u0644\u0633\u0624\u0627\u0644 \u0644\u064a\u0633 \u00ab\u0647\u0644\u00bb \u0628\u0644 \u00ab\u0643\u064a\u0641\u00bb \u0648\u00ab\u0645\u062a\u0649\u00bb', {
        left: 80, top: 410, width: 840, height: 60,
        fontSize: '22', bold: true, color: '#059669',
        fill: '#ecfdf5', defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s1a-a1', '\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0643\u0645 \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u062f\u0648\u0631\u0629 \u062d\u0648\u0644 \u0623\u0633\u0627\u0633\u064a\u0627\u062a \u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644. \u0646\u062d\u0646 \u0646\u0639\u064a\u0634 \u0641\u062a\u0631\u0629 \u0627\u0633\u062a\u062b\u0646\u0627\u0626\u064a\u0629: \u0623\u0643\u062b\u0631 \u0645\u0646 \u0633\u062a\u064a\u0646 \u0628\u0627\u0644\u0645\u0626\u0629 \u0645\u0646 \u0633\u0643\u0627\u0646 \u0634\u0645\u0627\u0644 \u0623\u0641\u0631\u064a\u0642\u064a\u0627 \u062a\u062d\u062a \u0633\u0646 \u0627\u0644\u062b\u0644\u0627\u062b\u064a\u0646\u060c \u0648\u0627\u0644\u062a\u0645\u0648\u064a\u0644 \u0644\u0644\u0634\u0631\u0643\u0627\u062a \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0641\u064a \u062a\u0632\u0627\u064a\u062f \u0645\u0633\u062a\u0645\u0631. \u062a\u0643\u0644\u0641\u0629 \u0625\u0637\u0644\u0627\u0642 \u0645\u0634\u0631\u0648\u0639 \u0631\u0642\u0645\u064a \u0627\u0646\u062e\u0641\u0636\u062a \u0639\u0634\u0631 \u0645\u0631\u0627\u062a \u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0639\u0627\u0645 \u0623\u0644\u0641\u064a\u0646 \u0648\u062e\u0645\u0633\u0629 \u0639\u0634\u0631.'),
    spotlightAction('d2s1a-a2', 'd2s1-s1-stat1'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

const demo2Scene1b: SceneRecord = {
  id: 'demo-ar-scene-1b',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0642\u0635\u0635 \u0646\u062c\u0627\u062d \u0645\u0644\u0647\u0645\u0629',
  order: 1,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s1-slide2', THEME_AR, [
      shapeEl('d2s1-s2-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#10b981', opacity: 0.05 }),
      textEl('d2s1-s2-title', '\u0642\u0635\u0635 \u0646\u062c\u0627\u062d \u0645\u0646 \u0627\u0644\u0645\u0646\u0637\u0642\u0629', {
        left: 80, top: 50, width: 840, height: 60,
        fontSize: '30', bold: true, color: '#059669', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s2-story1', '<strong>Chari (\u0627\u0644\u0645\u063a\u0631\u0628)</strong><br/>\u0645\u0646\u0635\u0629 B2B \u0644\u0644\u062a\u062c\u0627\u0631\u0629 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629 \u2014 \u062c\u0645\u0639\u062a \u0623\u0643\u062b\u0631 \u0645\u0646 100 \u0645\u0644\u064a\u0648\u0646 \u062f\u0648\u0644\u0627\u0631. \u0628\u062f\u0623\u062a \u0628\u0641\u0643\u0631\u0629 \u0628\u0633\u064a\u0637\u0629: \u062a\u0633\u0647\u064a\u0644 \u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0644\u0644\u0645\u062a\u0627\u062c\u0631 \u0627\u0644\u0635\u063a\u064a\u0631\u0629.', {
        left: 80, top: 140, width: 840, height: 90,
        fontSize: '16', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s2-story2', '<strong>Swvl (\u0645\u0635\u0631)</strong><br/>\u062d\u0644 \u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u0646\u0642\u0644 \u0627\u0644\u062c\u0645\u0627\u0639\u064a \u0641\u064a \u0627\u0644\u0642\u0627\u0647\u0631\u0629. \u0645\u0646 \u062d\u0627\u0641\u0644\u0629 \u0648\u0627\u062d\u062f\u0629 \u0625\u0644\u0649 \u0634\u0631\u0643\u0629 \u0639\u0627\u0644\u0645\u064a\u0629 \u0645\u062f\u0631\u062c\u0629 \u0641\u064a \u0627\u0644\u0628\u0648\u0631\u0635\u0629.', {
        left: 80, top: 260, width: 840, height: 90,
        fontSize: '16', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s2-story3', '<strong>Expensya (\u062a\u0648\u0646\u0633)</strong><br/>\u0628\u0631\u0646\u0627\u0645\u062c \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0635\u0627\u0631\u064a\u0641 \u2014 \u0648\u0635\u0644 \u0644\u0623\u0643\u062b\u0631 \u0645\u0646 5000 \u0639\u0645\u064a\u0644 \u0641\u064a 100 \u062f\u0648\u0644\u0629. \u0628\u062f\u0623 \u0641\u064a \u062a\u0648\u0646\u0633 \u0648\u062a\u0648\u0633\u0639 \u0639\u0627\u0644\u0645\u064a\u0627\u064b.', {
        left: 80, top: 380, width: 840, height: 90,
        fontSize: '16', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s2-lesson', '\u0627\u0644\u062f\u0631\u0633: \u0627\u0644\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0645\u062d\u0644\u064a\u0629 \u064a\u0645\u0643\u0646 \u0623\u0646 \u062a\u0635\u0628\u062d \u0641\u0631\u0635\u0627\u064b \u0639\u0627\u0644\u0645\u064a\u0629', {
        left: 80, top: 490, width: 840, height: 40,
        fontSize: '17', bold: true, color: '#059669', defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s1b-a1', '\u062f\u0639\u0648\u0646\u0627 \u0646\u0644\u0642\u064a \u0646\u0638\u0631\u0629 \u0639\u0644\u0649 \u0642\u0635\u0635 \u0646\u062c\u0627\u062d \u062d\u0642\u064a\u0642\u064a\u0629 \u0645\u0646 \u0645\u0646\u0637\u0642\u062a\u0646\u0627. \u0634\u0631\u0643\u0629 \u0634\u0627\u0631\u064a \u0641\u064a \u0627\u0644\u0645\u063a\u0631\u0628 \u062c\u0645\u0639\u062a \u0623\u0643\u062b\u0631 \u0645\u0646 \u0645\u0626\u0629 \u0645\u0644\u064a\u0648\u0646 \u062f\u0648\u0644\u0627\u0631. \u0648\u0633\u0648\u064a\u0641\u0644 \u0641\u064a \u0645\u0635\u0631 \u062d\u0644\u062a \u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u0646\u0642\u0644 \u0648\u0623\u0635\u0628\u062d\u062a \u0634\u0631\u0643\u0629 \u0639\u0627\u0644\u0645\u064a\u0629. \u0648\u0625\u0643\u0633\u0628\u0646\u0633\u064a\u0627 \u0645\u0646 \u062a\u0648\u0646\u0633 \u0648\u0635\u0644\u062a \u0644\u062e\u0645\u0633\u0629 \u0622\u0644\u0627\u0641 \u0639\u0645\u064a\u0644 \u0641\u064a \u0645\u0626\u0629 \u062f\u0648\u0644\u0629. \u0627\u0644\u062f\u0631\u0633 \u0647\u0648 \u0623\u0646 \u0627\u0644\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0645\u062d\u0644\u064a\u0629 \u064a\u0645\u0643\u0646 \u0623\u0646 \u062a\u0635\u0628\u062d \u0641\u0631\u0635\u0627\u064b \u0639\u0627\u0644\u0645\u064a\u0629.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

const demo2Scene1c: SceneRecord = {
  id: 'demo-ar-scene-1c',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0627\u0644\u0628\u064a\u0626\u0629 \u0627\u0644\u062f\u0627\u0639\u0645\u0629',
  order: 2,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s1-slide3', THEME_AR, [
      shapeEl('d2s1-s3-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#059669', opacity: 0.05 }),
      textEl('d2s1-s3-title', '\u0627\u0644\u0628\u064a\u0626\u0629 \u0627\u0644\u062f\u0627\u0639\u0645\u0629 \u0644\u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644', {
        left: 80, top: 50, width: 840, height: 60,
        fontSize: '30', bold: true, color: '#059669', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s3-p1', '<strong>\u0628\u0631\u0627\u0645\u062c \u062d\u0643\u0648\u0645\u064a\u0629</strong><br/>\u0627\u0644\u0645\u063a\u0631\u0628: \u0625\u0646\u0637\u0644\u0627\u0642\u0629\u060c \u0645\u0631\u0648\u062c | \u0645\u0635\u0631: Creativa | \u062a\u0648\u0646\u0633: Startup Act<br/>\u062a\u0645\u0648\u064a\u0644 \u0648\u0625\u0639\u0641\u0627\u0621\u0627\u062a \u0636\u0631\u064a\u0628\u064a\u0629 \u0648\u0645\u0633\u0627\u062d\u0627\u062a \u0639\u0645\u0644 \u0645\u062c\u0627\u0646\u064a\u0629', {
        left: 80, top: 140, width: 400, height: 130,
        fontSize: '15', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s3-p2', '<strong>\u062d\u0627\u0636\u0646\u0627\u062a \u0648\u0645\u0633\u0631\u0651\u0639\u0627\u062a</strong><br/>Technopark (\u0627\u0644\u0645\u063a\u0631\u0628) | Flat6Labs (\u0645\u0635\u0631) | Wiki Startup (\u062a\u0648\u0646\u0633)<br/>\u0625\u0631\u0634\u0627\u062f \u0648\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u0633\u062a\u062b\u0645\u0631\u064a\u0646', {
        left: 520, top: 140, width: 400, height: 130,
        fontSize: '15', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s3-p3', '<strong>\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u062a\u0645\u0648\u064a\u0644</strong><br/>\u0635\u0646\u0627\u062f\u064a\u0642 \u0627\u0633\u062a\u062b\u0645\u0627\u0631 \u0625\u0642\u0644\u064a\u0645\u064a\u0629 (\u0645\u062b\u0644 212 Founders, Algebra Ventures)<br/>\u062a\u0645\u0648\u064a\u0644 \u062c\u0645\u0627\u0639\u064a \u0639\u0628\u0631 \u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a<br/>\u0628\u0631\u0627\u0645\u062c \u0645\u0646\u062d \u062f\u0648\u0644\u064a\u0629 (\u0645\u062b\u0644 Orange Corners, Afrilabs)', {
        left: 80, top: 300, width: 840, height: 130,
        fontSize: '15', color: '#334155', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s1-s3-bottom', '\u0644\u0633\u062a \u0648\u062d\u062f\u0643 \u2014 \u0647\u0646\u0627\u0643 \u0646\u0638\u0627\u0645 \u0628\u064a\u0626\u064a \u0643\u0627\u0645\u0644 \u064a\u062f\u0639\u0645\u0643', {
        left: 80, top: 470, width: 840, height: 50,
        fontSize: '18', bold: true, color: '#059669',
        fill: '#ecfdf5', defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s1c-a1', '\u0627\u0644\u0628\u064a\u0626\u0629 \u0627\u0644\u062f\u0627\u0639\u0645\u0629 \u0644\u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0641\u064a \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0623\u0635\u0628\u062d\u062a \u0623\u0642\u0648\u0649 \u0645\u0646 \u0623\u064a \u0648\u0642\u062a \u0645\u0636\u0649. \u0628\u0631\u0627\u0645\u062c \u062d\u0643\u0648\u0645\u064a\u0629 \u0645\u062b\u0644 \u0625\u0646\u0637\u0644\u0627\u0642\u0629 \u0641\u064a \u0627\u0644\u0645\u063a\u0631\u0628\u060c \u062d\u0627\u0636\u0646\u0627\u062a \u0645\u062b\u0644 \u062a\u0643\u0646\u0648\u0628\u0627\u0631\u0643 \u0648\u0641\u0644\u0627\u062a \u0633\u064a\u0643\u0633 \u0644\u0627\u0628\u0632\u060c \u0648\u0635\u0646\u0627\u062f\u064a\u0642 \u0627\u0633\u062a\u062b\u0645\u0627\u0631 \u0625\u0642\u0644\u064a\u0645\u064a\u0629. \u0644\u0633\u062a \u0648\u062d\u062f\u0643 \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0631\u062d\u0644\u0629.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

// Scene 2 — Quiz: Lean Startup
const demo2Scene2: SceneRecord = {
  id: 'demo-ar-scene-2',
  stageId: DEMO2_STAGE_ID,
  type: 'quiz',
  title: '\u0627\u062e\u062a\u0628\u0627\u0631 \u2014 \u0645\u0646\u0647\u062c\u064a\u0629 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0627\u0644\u0631\u0634\u064a\u0642\u0629',
  order: 3,
  content: {
    type: 'quiz',
    questions: [
      {
        id: 'q1-ar',
        type: 'single',
        question: '\u0645\u0627 \u0647\u0648 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0623\u062f\u0646\u0649 (MVP)\u061f',
        options: [
          { label: '\u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0627\u0644\u0643\u0627\u0645\u0644 \u062c\u0627\u0647\u0632 \u0644\u0644\u0633\u0648\u0642', value: 'A' },
          { label: '\u0623\u0628\u0633\u0637 \u0646\u0633\u062e\u0629 \u0645\u0646 \u0627\u0644\u0645\u0646\u062a\u062c \u062a\u062d\u0644 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0648\u062a\u0633\u0645\u062d \u0628\u062c\u0645\u0639 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0639\u0645\u0644\u0627\u0621', value: 'B' },
          { label: '\u0646\u0645\u0648\u0630\u062c \u0623\u0648\u0644\u064a \u0644\u0627 \u064a\u0639\u0645\u0644 \u0641\u0639\u0644\u064a\u0627\u064b', value: 'C' },
          { label: '\u062e\u0637\u0629 \u0639\u0645\u0644 \u0645\u0643\u062a\u0648\u0628\u0629 \u0641\u0642\u0637', value: 'D' },
        ],
        answer: ['B'],
        analysis: '\u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0623\u062f\u0646\u0649 (MVP) \u0647\u0648 \u0623\u0628\u0633\u0637 \u0646\u0633\u062e\u0629 \u0645\u0646 \u0645\u0646\u062a\u062c\u0643 \u062a\u062d\u0644 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629. \u0627\u0644\u0647\u062f\u0641 \u0644\u064a\u0633 \u0628\u0646\u0627\u0621 \u0645\u0646\u062a\u062c \u0643\u0627\u0645\u0644\u060c \u0628\u0644 \u0627\u062e\u062a\u0628\u0627\u0631 \u0641\u0631\u0636\u064a\u062a\u0643 \u0645\u0639 \u0623\u0642\u0644 \u062c\u0647\u062f \u0648\u062a\u0643\u0644\u0641\u0629 \u0645\u0645\u0643\u0646\u0629\u060c \u0648\u062c\u0645\u0639 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u062d\u0642\u064a\u0642\u064a\u0629 \u0645\u0646 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646 \u0644\u062a\u062d\u0633\u064a\u0646 \u0627\u0644\u0645\u0646\u062a\u062c.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q2-ar',
        type: 'single',
        question: '\u0645\u0627 \u0647\u064a \u062d\u0644\u0642\u0629 \u00ab\u0627\u0628\u0646\u0650 \u2014 \u0642\u0650\u0633 \u2014 \u062a\u0639\u0644\u0651\u0645\u00bb (Build-Measure-Learn)\u061f',
        options: [
          { label: '\u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0643\u0627\u0645\u0644 \u062b\u0645 \u0642\u064a\u0627\u0633 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u062b\u0645 \u062a\u0639\u0644\u0645 \u0623\u0633\u0628\u0627\u0628 \u0627\u0644\u0641\u0634\u0644', value: 'A' },
          { label: '\u062f\u0648\u0631\u0629 \u0645\u062a\u0643\u0631\u0631\u0629: \u0628\u0646\u0627\u0621 \u0646\u0633\u062e\u0629 \u0633\u0631\u064a\u0639\u0629\u060c \u0642\u064a\u0627\u0633 \u0627\u0633\u062a\u062c\u0627\u0628\u0629 \u0627\u0644\u0633\u0648\u0642\u060c \u062a\u0639\u0644\u0645 \u0645\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a\u060c \u062b\u0645 \u062a\u0643\u0631\u0627\u0631 \u0627\u0644\u0639\u0645\u0644\u064a\u0629', value: 'B' },
          { label: '\u062a\u0639\u0644\u0645 \u0627\u0644\u0628\u0631\u0645\u062c\u0629 \u062b\u0645 \u0628\u0646\u0627\u0621 \u062a\u0637\u0628\u064a\u0642 \u062b\u0645 \u0642\u064a\u0627\u0633 \u0627\u0644\u0623\u0631\u0628\u0627\u062d', value: 'C' },
          { label: '\u0643\u062a\u0627\u0628\u0629 \u062e\u0637\u0629 \u0639\u0645\u0644\u060c \u0642\u064a\u0627\u0633 \u0627\u0644\u062a\u0643\u0627\u0644\u064a\u0641\u060c \u062a\u0639\u0644\u0645 \u0639\u0646 \u0627\u0644\u0645\u0646\u0627\u0641\u0633\u064a\u0646', value: 'D' },
        ],
        answer: ['B'],
        analysis: '\u062d\u0644\u0642\u0629 \u0627\u0628\u0646\u0650-\u0642\u0650\u0633-\u062a\u0639\u0644\u0651\u0645 \u0647\u064a \u062c\u0648\u0647\u0631 \u0645\u0646\u0647\u062c\u064a\u0629 Lean Startup. \u0627\u0644\u0641\u0643\u0631\u0629 \u0623\u0646 \u062a\u0628\u0646\u064a \u0628\u0633\u0631\u0639\u0629\u060c \u062a\u0642\u064a\u0633 \u0627\u0633\u062a\u062c\u0627\u0628\u0629 \u0627\u0644\u0633\u0648\u0642 \u0628\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a (\u0648\u0644\u064a\u0633 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u0627\u062a)\u060c \u062a\u062a\u0639\u0644\u0645 \u0645\u0646 \u0627\u0644\u0646\u062a\u0627\u0626\u062c\u060c \u062b\u0645 \u062a\u0643\u0631\u0631 \u0627\u0644\u0639\u0645\u0644\u064a\u0629. \u0643\u0644 \u062f\u0648\u0631\u0629 \u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0623\u0633\u0631\u0639 \u0645\u0646 \u0633\u0627\u0628\u0642\u062a\u0647\u0627.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q3-ar',
        type: 'single',
        question: '\u0645\u0627\u0630\u0627 \u064a\u0639\u0646\u064a \u00ab\u0627\u0644\u0645\u062d\u0648\u0631\u00bb (Pivot) \u0641\u064a \u0639\u0627\u0644\u0645 \u0627\u0644\u0634\u0631\u0643\u0627\u062a \u0627\u0644\u0646\u0627\u0634\u0626\u0629\u061f',
        options: [
          { label: '\u0625\u063a\u0644\u0627\u0642 \u0627\u0644\u0634\u0631\u0643\u0629 \u0648\u0627\u0644\u0628\u062f\u0621 \u0645\u0646 \u0627\u0644\u0635\u0641\u0631', value: 'A' },
          { label: '\u062a\u063a\u064a\u064a\u0631 \u062c\u0648\u0647\u0631\u064a \u0641\u064a \u0627\u0644\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629 \u0623\u0648 \u0627\u0644\u0645\u0646\u062a\u062c \u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0645\u0627 \u062a\u0639\u0644\u0645\u062a\u0647 \u0645\u0646 \u0627\u0644\u0633\u0648\u0642', value: 'B' },
          { label: '\u0632\u064a\u0627\u062f\u0629 \u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0627\u0644\u062a\u0633\u0648\u064a\u0642', value: 'C' },
          { label: '\u062a\u063a\u064a\u064a\u0631 \u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629 \u0641\u0642\u0637', value: 'D' },
        ],
        answer: ['B'],
        analysis: '\u0627\u0644\u0645\u062d\u0648\u0631 \u0647\u0648 \u062a\u063a\u064a\u064a\u0631 \u062c\u0648\u0647\u0631\u064a \u0641\u064a \u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u062a\u0643 \u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0628\u064a\u0627\u0646\u0627\u062a \u062d\u0642\u064a\u0642\u064a\u0629 \u0645\u0646 \u0627\u0644\u0633\u0648\u0642. \u0644\u064a\u0633 \u0641\u0634\u0644\u0627\u064b \u0628\u0644 \u062a\u0643\u064a\u0651\u0641 \u0630\u0643\u064a. \u0645\u062b\u0627\u0644: Slack \u0628\u062f\u0623\u062a \u0643\u0634\u0631\u0643\u0629 \u0623\u0644\u0639\u0627\u0628 \u0641\u064a\u062f\u064a\u0648\u060c \u0644\u0643\u0646\u0647\u0627 \u062a\u062d\u0648\u0644\u062a \u0644\u0645\u0646\u0635\u0629 \u062a\u0648\u0627\u0635\u0644 \u0645\u0647\u0646\u064a.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q4-ar',
        type: 'short_answer',
        question: '\u0627\u0634\u0631\u062d \u0628\u0643\u0644\u0645\u0627\u062a\u0643 \u0627\u0644\u062e\u0627\u0635\u0629: \u0644\u0645\u0627\u0630\u0627 \u0645\u0646 \u0627\u0644\u0645\u0647\u0645 \u0627\u0644\u062a\u062d\u062f\u062b \u0645\u0639 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u062d\u062a\u0645\u0644\u064a\u0646 \u0642\u0628\u0644 \u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c\u061f',
        commentPrompt: '\u064a\u062c\u0628 \u0623\u0646 \u064a\u0630\u0643\u0631 \u0627\u0644\u0645\u062a\u0639\u0644\u0645 \u0623\u0647\u0645\u064a\u0629 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0648\u062c\u0648\u062f \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0641\u0639\u0644\u0627\u064b \u0639\u0646\u062f \u0627\u0644\u0639\u0645\u0644\u0627\u0621\u060c \u0648\u0641\u0647\u0645 \u0627\u062d\u062a\u064a\u0627\u062c\u0627\u062a\u0647\u0645 \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629 \u0628\u062f\u0644 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u0627\u062a\u060c \u0648\u062a\u0648\u0641\u064a\u0631 \u0627\u0644\u0648\u0642\u062a \u0648\u0627\u0644\u0645\u0627\u0644 \u0628\u062a\u062c\u0646\u0628 \u0628\u0646\u0627\u0621 \u0634\u064a\u0621 \u0644\u0627 \u064a\u0631\u064a\u062f\u0647 \u0623\u062d\u062f.',
        analysis: '\u0627\u0644\u062a\u062d\u062f\u062b \u0645\u0639 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u062d\u062a\u0645\u0644\u064a\u0646 \u0642\u0628\u0644 \u0627\u0644\u0628\u0646\u0627\u0621 \u064a\u0633\u0627\u0639\u062f\u0643 \u0639\u0644\u0649: \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0623\u0646 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u062d\u0642\u064a\u0642\u064a\u0629 \u0648\u0644\u064a\u0633\u062a \u0627\u0641\u062a\u0631\u0627\u0636\u0627\u064b \u0641\u064a \u0630\u0647\u0646\u0643 \u0641\u0642\u0637\u060c \u0641\u0647\u0645 \u0643\u064a\u0641 \u064a\u062d\u0644\u0648\u0646 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u062d\u0627\u0644\u064a\u0627\u064b\u060c \u0627\u0643\u062a\u0634\u0627\u0641 \u0645\u0627 \u0647\u0645 \u0645\u0633\u062a\u0639\u062f\u0648\u0646 \u0644\u062f\u0641\u0639 \u062b\u0645\u0646\u0647\u060c \u0648\u062a\u0648\u0641\u064a\u0631 \u0623\u0634\u0647\u0631 \u0645\u0646 \u0627\u0644\u0639\u0645\u0644 \u0648\u0627\u0644\u0645\u0627\u0644 \u0639\u0644\u0649 \u0645\u0646\u062a\u062c \u0642\u062f \u0644\u0627 \u064a\u0631\u064a\u062f\u0647 \u0623\u062d\u062f.',
        hasAnswer: false,
        points: 3,
      },
    ],
  } as QuizContent,
  actions: [
    speechAction('d2s2-a1', '\u062d\u0627\u0646 \u0648\u0642\u062a \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631. \u0647\u0630\u0647 \u0623\u0631\u0628\u0639\u0629 \u0623\u0633\u0626\u0644\u0629 \u062d\u0648\u0644 \u0645\u0646\u0647\u062c\u064a\u0629 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0627\u0644\u0631\u0634\u064a\u0642\u0629 \u0623\u0648 \u0645\u0627 \u064a\u0639\u0631\u0641 \u0628\u0627\u0644\u0640 Lean Startup. \u062e\u0630 \u0648\u0642\u062a\u0643 \u0641\u064a \u0627\u0644\u062a\u0641\u0643\u064a\u0631 \u0641\u064a \u0643\u0644 \u0633\u0624\u0627\u0644.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

// Scene 3 — Slides: خطوات عملية للبدء
const demo2Scene3a: SceneRecord = {
  id: 'demo-ar-scene-3a',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0627\u0644\u062e\u0637\u0648\u0629 1 \u2014 \u0627\u0643\u062a\u0634\u0627\u0641 \u0627\u0644\u0645\u0634\u0643\u0644\u0629',
  order: 4,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s3-slide1', THEME_AR, [
      shapeEl('d2s3-s1-accent', { left: 992, top: 0, width: 8, height: 562, fill: '#059669' }),
      textEl('d2s3-s1-badge', '\u0627\u0644\u062e\u0637\u0648\u0629 1', {
        left: 80, top: 40, width: 120, height: 36,
        fontSize: '14', bold: true, color: '#ffffff',
        fill: '#059669', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s1-title', '\u0627\u0643\u062a\u0634\u0627\u0641 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629', {
        left: 80, top: 90, width: 840, height: 50,
        fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s1-content', '<strong>\u0643\u064a\u0641 \u062a\u062c\u062f \u0641\u0643\u0631\u0629 \u0645\u0634\u0631\u0648\u0639\u0643\u061f</strong><br/><br/><strong>\u0644\u0627\u062d\u0638 \u0645\u0634\u0627\u0643\u0644\u0643 \u0627\u0644\u064a\u0648\u0645\u064a\u0629</strong> \u2014 \u0645\u0627 \u0627\u0644\u0630\u064a \u064a\u0632\u0639\u062c\u0643\u061f \u0645\u0627 \u0627\u0644\u0630\u064a \u064a\u0633\u062a\u063a\u0631\u0642 \u0648\u0642\u062a\u0627\u064b \u0623\u0637\u0648\u0644 \u0645\u0645\u0627 \u064a\u0646\u0628\u063a\u064a\u061f<br/><br/><strong>\u062a\u062d\u062f\u062b \u0645\u0639 20 \u0634\u062e\u0635\u0627\u064b</strong> \u2014 \u0627\u0633\u0623\u0644\u0647\u0645 \u0639\u0646 \u0623\u0643\u0628\u0631 \u062a\u062d\u062f\u064a\u0627\u062a\u0647\u0645 \u0641\u064a \u0645\u062c\u0627\u0644 \u0645\u0639\u064a\u0646<br/><br/><strong>\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0646\u062a\u062f\u064a\u0627\u062a</strong> \u2014 Reddit\u060c \u0645\u062c\u0645\u0648\u0639\u0627\u062a Facebook\u060c Twitter: \u0623\u064a\u0646 \u064a\u0634\u062a\u0643\u064a \u0627\u0644\u0646\u0627\u0633\u061f<br/><br/><strong>\u0627\u0646\u0638\u0631 \u0644\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0645\u062a\u0642\u062f\u0645\u0629</strong> \u2014 \u0645\u0627 \u0627\u0644\u0630\u064a \u0646\u062c\u062d \u0641\u064a \u0623\u0648\u0631\u0648\u0628\u0627/\u0623\u0645\u0631\u064a\u0643\u0627 \u0648\u0644\u0645 \u064a\u0635\u0644 \u0644\u0645\u0646\u0637\u0642\u062a\u0646\u0627 \u0628\u0639\u062f\u061f<br/><br/><strong>\u0627\u062e\u062a\u0628\u0631: \u0647\u0644 \u064a\u062f\u0641\u0639 \u0623\u062d\u062f \u062b\u0645\u0646 \u0627\u0644\u062d\u0644 \u062d\u0627\u0644\u064a\u0627\u064b\u061f</strong> \u2014 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0646\u0627\u0633 \u064a\u062f\u0641\u0639\u0648\u0646 \u062d\u062a\u0649 \u0644\u062d\u0644 \u0633\u064a\u0621\u060c \u0641\u0627\u0644\u0641\u0631\u0635\u0629 \u062d\u0642\u064a\u0642\u064a\u0629', {
        left: 80, top: 155, width: 840, height: 360,
        fontSize: '15', color: '#334155', lineHeight: 1.6,
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s3a-a1', '\u0627\u0644\u062e\u0637\u0648\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0641\u064a \u0631\u064a\u0627\u062f\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0647\u064a \u0627\u0643\u062a\u0634\u0627\u0641 \u0645\u0634\u0643\u0644\u0629 \u062d\u0642\u064a\u0642\u064a\u0629. \u0644\u0627\u062d\u0638 \u0645\u0634\u0627\u0643\u0644\u0643 \u0627\u0644\u064a\u0648\u0645\u064a\u0629\u060c \u062a\u062d\u062f\u062b \u0645\u0639 \u0639\u0634\u0631\u064a\u0646 \u0634\u062e\u0635\u0627\u064b \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644\u060c \u0648\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0646\u062a\u062f\u064a\u0627\u062a. \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0646\u0627\u0633 \u064a\u062f\u0641\u0639\u0648\u0646 \u062b\u0645\u0646 \u062d\u0644 \u0633\u064a\u0621 \u062d\u0627\u0644\u064a\u0627\u064b\u060c \u0641\u0647\u0630\u0647 \u0641\u0631\u0635\u0629 \u0630\u0647\u0628\u064a\u0629 \u0644\u0643.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

const demo2Scene3b: SceneRecord = {
  id: 'demo-ar-scene-3b',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0627\u0644\u062e\u0637\u0648\u0629 2 \u2014 \u0628\u0646\u0627\u0621 MVP',
  order: 5,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s3-slide2', THEME_AR, [
      shapeEl('d2s3-s2-accent', { left: 992, top: 0, width: 8, height: 562, fill: '#10b981' }),
      textEl('d2s3-s2-badge', '\u0627\u0644\u062e\u0637\u0648\u0629 2', {
        left: 80, top: 40, width: 120, height: 36,
        fontSize: '14', bold: true, color: '#ffffff',
        fill: '#10b981', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s2-title', '\u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0623\u062f\u0646\u0649 \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0637\u0628\u064a\u0642', {
        left: 80, top: 90, width: 840, height: 50,
        fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s2-content', '<strong>\u0627\u0644\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0630\u0647\u0628\u064a\u0629: \u0627\u0628\u0646\u0650 \u0623\u0642\u0644 \u0645\u0627 \u064a\u0645\u0643\u0646\u0643</strong><br/><br/><strong>\u0627\u0644\u0623\u0633\u0628\u0648\u0639 1:</strong> \u0635\u0641\u062d\u0629 \u0647\u0628\u0648\u0637 \u0628\u0633\u064a\u0637\u0629 \u062a\u0634\u0631\u062d \u0627\u0644\u062d\u0644 + \u0646\u0645\u0648\u0630\u062c \u062a\u0633\u062c\u064a\u0644<br/><br/><strong>\u0627\u0644\u0623\u0633\u0628\u0648\u0639 2:</strong> \u0646\u0633\u062e\u0629 \u064a\u062f\u0648\u064a\u0629 \u0645\u0646 \u0627\u0644\u062d\u0644 (Concierge MVP) \u2014 \u0642\u062f\u0651\u0645 \u0627\u0644\u062e\u062f\u0645\u0629 \u064a\u062f\u0648\u064a\u0627\u064b \u0644\u0640 10 \u0639\u0645\u0644\u0627\u0621<br/><br/><strong>\u0627\u0644\u0623\u0633\u0628\u0648\u0639 3-4:</strong> \u0628\u0646\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0627\u0644\u0628\u0633\u064a\u0637\u0629 \u2014 \u0645\u064a\u0632\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u0642\u0637 \u062a\u062d\u0644 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629<br/><br/><strong>\u0644\u0627 \u062a\u0641\u0639\u0644:</strong> \u0644\u0627 \u062a\u0628\u0631\u0645\u062c \u062a\u0637\u0628\u064a\u0642\u0627\u064b \u0643\u0627\u0645\u0644\u0627\u064b\u060c \u0644\u0627 \u062a\u0635\u0645\u0645 \u0634\u0639\u0627\u0631\u0627\u064b \u0645\u062b\u0627\u0644\u064a\u0627\u064b\u060c \u0644\u0627 \u062a\u0646\u062a\u0638\u0631 \u0627\u0644\u0643\u0645\u0627\u0644<br/><br/><strong>\u0627\u0641\u0639\u0644:</strong> \u0627\u062e\u062a\u0628\u0631\u060c \u0627\u062c\u0645\u0639 \u0645\u0644\u0627\u062d\u0638\u0627\u062a\u060c \u062d\u0633\u0651\u0646\u060c \u0643\u0631\u0651\u0631', {
        left: 80, top: 155, width: 840, height: 360,
        fontSize: '15', color: '#334155', lineHeight: 1.6,
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s3b-a1', '\u0627\u0644\u062e\u0637\u0648\u0629 \u0627\u0644\u062b\u0627\u0646\u064a\u0629 \u0647\u064a \u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0623\u062f\u0646\u0649 \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0637\u0628\u064a\u0642. \u0627\u0644\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0630\u0647\u0628\u064a\u0629: \u0627\u0628\u0646\u0650 \u0623\u0642\u0644 \u0645\u0627 \u064a\u0645\u0643\u0646\u0643. \u0641\u064a \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u0623\u0648\u0644\u060c \u0623\u0646\u0634\u0626 \u0635\u0641\u062d\u0629 \u0647\u0628\u0648\u0637 \u0628\u0633\u064a\u0637\u0629. \u0641\u064a \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u062b\u0627\u0646\u064a\u060c \u0642\u062f\u0651\u0645 \u0627\u0644\u062e\u062f\u0645\u0629 \u064a\u062f\u0648\u064a\u0627\u064b \u0644\u0639\u0634\u0631\u0629 \u0639\u0645\u0644\u0627\u0621. \u0644\u0627 \u062a\u0646\u062a\u0638\u0631 \u0627\u0644\u0643\u0645\u0627\u0644 \u2014 \u0627\u0644\u0643\u0645\u0627\u0644 \u0639\u062f\u0648 \u0627\u0644\u062a\u0642\u062f\u0645.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

const demo2Scene3c: SceneRecord = {
  id: 'demo-ar-scene-3c',
  stageId: DEMO2_STAGE_ID,
  type: 'slide',
  title: '\u0627\u0644\u062e\u0637\u0648\u0629 3 \u2014 \u0627\u0644\u0646\u0645\u0648 \u0648\u0627\u0644\u062a\u0645\u0648\u064a\u0644',
  order: 6,
  content: {
    type: 'slide',
    canvas: makeSlide('d2s3-slide3', THEME_AR, [
      shapeEl('d2s3-s3-accent', { left: 992, top: 0, width: 8, height: 562, fill: '#059669' }),
      textEl('d2s3-s3-badge', '\u0627\u0644\u062e\u0637\u0648\u0629 3', {
        left: 80, top: 40, width: 120, height: 36,
        fontSize: '14', bold: true, color: '#ffffff',
        fill: '#059669', defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s3-title', '\u0627\u0644\u0646\u0645\u0648 \u0648\u062c\u0645\u0639 \u0627\u0644\u062a\u0645\u0648\u064a\u0644', {
        left: 80, top: 90, width: 840, height: 50,
        fontSize: '28', bold: true, color: '#1e293b', textType: 'title',
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
      textEl('d2s3-s3-content', '<strong>\u0645\u062a\u0649 \u062a\u0628\u062d\u062b \u0639\u0646 \u062a\u0645\u0648\u064a\u0644\u061f</strong><br/><br/>\u0644\u062f\u064a\u0643 \u0639\u0645\u0644\u0627\u0621 \u064a\u062f\u0641\u0639\u0648\u0646 (\u062d\u062a\u0649 \u0644\u0648 \u0642\u0644\u064a\u0644\u0648\u0646)<br/>\u0623\u062b\u0628\u062a\u062a \u0623\u0646 \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u062d\u0642\u064a\u0642\u064a\u0629 \u0648\u0627\u0644\u062d\u0644 \u064a\u0639\u0645\u0644<br/>\u062a\u062d\u062a\u0627\u062c \u0627\u0644\u0645\u0627\u0644 \u0644\u0644\u062a\u0648\u0633\u0639 \u2014 \u0648\u0644\u064a\u0633 \u0644\u0644\u0628\u062f\u0621<br/><br/><strong>\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u062a\u0645\u0648\u064a\u0644 \u0627\u0644\u0645\u062a\u0627\u062d\u0629:</strong><br/><br/>1. <strong>Bootstrapping</strong> \u2014 \u0645\u062f\u062e\u0631\u0627\u062a\u0643 + \u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0627\u0644\u0645\u0634\u0631\u0648\u0639 (\u0627\u0644\u0623\u0641\u0636\u0644 \u0644\u0644\u0628\u062f\u0627\u064a\u0629)<br/>2. <strong>\u0645\u0646\u062d \u0648\u0645\u0633\u0627\u0628\u0642\u0627\u062a</strong> \u2014 Orange Corners\u060c GSMA\u060c Hult Prize<br/>3. <strong>\u0645\u0633\u062a\u062b\u0645\u0631\u0648\u0646 \u0645\u0644\u0627\u0626\u0643\u0629</strong> \u2014 \u0623\u0641\u0631\u0627\u062f \u064a\u0633\u062a\u062b\u0645\u0631\u0648\u0646 10,000-100,000$<br/>4. <strong>\u0631\u0623\u0633 \u0645\u0627\u0644 \u0645\u062e\u0627\u0637\u0631 (VC)</strong> \u2014 \u0644\u0644\u0645\u0631\u0627\u062d\u0644 \u0627\u0644\u0645\u062a\u0642\u062f\u0645\u0629 \u0641\u0642\u0637', {
        left: 80, top: 155, width: 840, height: 370,
        fontSize: '15', color: '#334155', lineHeight: 1.6,
        defaultFontName: 'IBM Plex Sans Arabic',
      }),
    ]),
  } as SlideContent,
  actions: [
    speechAction('d2s3c-a1', '\u0627\u0644\u062e\u0637\u0648\u0629 \u0627\u0644\u062b\u0627\u0644\u062b\u0629 \u0647\u064a \u0627\u0644\u0646\u0645\u0648 \u0648\u062c\u0645\u0639 \u0627\u0644\u062a\u0645\u0648\u064a\u0644. \u0644\u0643\u0646 \u0627\u0646\u062a\u0628\u0647: \u0644\u0627 \u062a\u0628\u062d\u062b \u0639\u0646 \u062a\u0645\u0648\u064a\u0644 \u0642\u0628\u0644 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0644\u062f\u064a\u0643 \u0639\u0645\u0644\u0627\u0621 \u064a\u062f\u0641\u0639\u0648\u0646. \u0627\u0628\u062f\u0623 \u0628\u0645\u062f\u062e\u0631\u0627\u062a\u0643\u060c \u062b\u0645 \u0627\u0628\u062d\u062b \u0639\u0646 \u0645\u0646\u062d \u0648\u0645\u0633\u0627\u0628\u0642\u0627\u062a\u060c \u0648\u0628\u0639\u062f\u0647\u0627 \u0641\u0643\u0651\u0631 \u0641\u064a \u0627\u0644\u0645\u0633\u062a\u062b\u0645\u0631\u064a\u0646. \u0627\u0644\u062a\u0645\u0648\u064a\u0644 \u0644\u0644\u062a\u0648\u0633\u0639 \u0648\u0644\u064a\u0633 \u0644\u0644\u0628\u062f\u0621.'),
  ],
  createdAt: Date.now() - 86400000 * 2,
  updatedAt: Date.now() - 86400000 * 2,
};

// ─── DEMO 3 — AI Tools for Business (EN) ─────────────────────────

const DEMO3_STAGE_ID = 'demo-ai-tools-business-en';

const demo3Stage: StageRecord = {
  id: DEMO3_STAGE_ID,
  name: 'AI Tools for Business',
  description:
    'A practical guide to AI tools transforming business operations in 2026. Covers the AI landscape, tool selection, and real-world applications across marketing, sales, operations, and strategy.',
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
  language: 'en-US',
  style: 'professional',
};

// Scene 1 — Slides: The AI Landscape in 2026
const demo3Scene1a: SceneRecord = {
  id: 'demo-en-scene-1a',
  stageId: DEMO3_STAGE_ID,
  type: 'slide',
  title: 'The AI Landscape in 2026',
  order: 0,
  content: {
    type: 'slide',
    canvas: makeSlide('d3s1-slide1', THEME_EN, [
      shapeEl('d3s1-s1-bg', { left: 0, top: 0, width: 1000, height: 562, fill: '#3b82f6', opacity: 0.1 }),
      textEl('d3s1-s1-title', 'The AI Landscape in 2026', {
        left: 80, top: 50, width: 840, height: 70,
        fontSize: '36', bold: true, color: '#60a5fa', textType: 'title',
      }),
      textEl('d3s1-s1-subtitle', 'From hype to essential business infrastructure', {
        left: 80, top: 130, width: 840, height: 40,
        fontSize: '20', color: '#94a3b8', textType: 'subtitle',
      }),
      textEl('d3s1-s1-stat1', '<strong>92% of Fortune 500 companies</strong> now use AI tools in daily operations', {
        left: 80, top: 210, width: 840, height: 45,
        fontSize: '18', color: '#e2e8f0',
      }),
      textEl('d3s1-s1-stat2', '<strong>AI adoption grew 3.5x</strong> among SMBs since 2024', {
        left: 80, top: 265, width: 840, height: 45,
        fontSize: '18', color: '#e2e8f0',
      }),
      textEl('d3s1-s1-stat3', '<strong>Average productivity gain: 37%</strong> for teams using AI-assisted workflows', {
        left: 80, top: 320, width: 840, height: 45,
        fontSize: '18', color: '#e2e8f0',
      }),
      textEl('d3s1-s1-key', 'The question is no longer "should we use AI?" \u2014 it\'s "which AI tools, and how?"', {
        left: 80, top: 420, width: 840, height: 60,
        fontSize: '20', bold: true, color: '#60a5fa',
        fill: '#1e3a5f', lineHeight: 1.6,
      }),
    ], '#0f172a'),
  } as SlideContent,
  actions: [
    speechAction('d3s1a-a1', 'Welcome to this course on AI tools for business. In 2026, AI is no longer a novelty \u2014 it\'s essential infrastructure. 92 percent of Fortune 500 companies use AI daily, and SMBs have increased adoption 3.5 times since 2024. The average productivity gain is 37 percent. The question now is not whether to use AI, but which tools and how.'),
    spotlightAction('d3s1a-a2', 'd3s1-s1-key'),
  ],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

const demo3Scene1b: SceneRecord = {
  id: 'demo-en-scene-1b',
  stageId: DEMO3_STAGE_ID,
  type: 'slide',
  title: 'AI Tool Categories',
  order: 1,
  content: {
    type: 'slide',
    canvas: makeSlide('d3s1-slide2', THEME_EN, [
      textEl('d3s1-s2-title', 'The 6 Categories of Business AI', {
        left: 80, top: 40, width: 840, height: 60,
        fontSize: '30', bold: true, color: '#60a5fa', textType: 'title',
      }),
      textEl('d3s1-s2-c1', '<strong>AI Assistants</strong><br/>Claude, ChatGPT, Gemini<br/>General-purpose reasoning & writing', {
        left: 60, top: 120, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-c2', '<strong>Content & Copy</strong><br/>Jasper, Copy.ai, Writer<br/>Marketing copy, blog posts, ads', {
        left: 360, top: 120, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-c3', '<strong>Design & Visual</strong><br/>Midjourney, DALL-E, Canva AI<br/>Images, presentations, branding', {
        left: 660, top: 120, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-c4', '<strong>Data & Analytics</strong><br/>Julius, Hex, Coefficient<br/>Data analysis, dashboards, insights', {
        left: 60, top: 290, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-c5', '<strong>Automation</strong><br/>n8n, Zapier AI, Make<br/>Workflow automation with AI logic', {
        left: 360, top: 290, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-c6', '<strong>Sales & CRM</strong><br/>Apollo AI, Gong, Clay<br/>Lead gen, call analysis, outreach', {
        left: 660, top: 290, width: 280, height: 120,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s2-tip', 'Start with 1-2 categories that match your biggest bottleneck. Don\'t try to adopt everything at once.', {
        left: 80, top: 460, width: 840, height: 50,
        fontSize: '16', bold: true, color: '#60a5fa',
        fill: '#1e3a5f',
      }),
    ], '#0f172a'),
  } as SlideContent,
  actions: [
    speechAction('d3s1b-a1', 'Business AI tools fall into 6 main categories. AI assistants like Claude and ChatGPT for reasoning and writing. Content tools like Jasper for marketing copy. Design tools like Midjourney. Data analytics tools like Julius. Automation platforms like n8n and Zapier. And sales tools like Apollo and Gong. Start with one or two categories that address your biggest bottleneck.'),
  ],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

const demo3Scene1c: SceneRecord = {
  id: 'demo-en-scene-1c',
  stageId: DEMO3_STAGE_ID,
  type: 'slide',
  title: 'Use Cases by Department',
  order: 2,
  content: {
    type: 'slide',
    canvas: makeSlide('d3s1-slide3', THEME_EN, [
      textEl('d3s1-s3-title', 'Real Use Cases by Department', {
        left: 80, top: 40, width: 840, height: 60,
        fontSize: '30', bold: true, color: '#60a5fa', textType: 'title',
      }),
      textEl('d3s1-s3-marketing', '<strong>Marketing</strong><br/>Generate 50 ad variations in 10 minutes (Jasper + Claude)<br/>Auto-create social media calendars from blog content<br/>Personalize email campaigns at scale with AI segmentation', {
        left: 60, top: 120, width: 420, height: 140,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s3-sales', '<strong>Sales</strong><br/>Auto-research prospects before calls (Clay + Apollo)<br/>Analyze call recordings for winning patterns (Gong)<br/>Generate personalized outreach sequences in seconds', {
        left: 520, top: 120, width: 420, height: 140,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s3-ops', '<strong>Operations</strong><br/>Automate invoice processing and data entry (n8n)<br/>Generate weekly reports from raw data automatically<br/>Route customer support tickets with AI classification', {
        left: 60, top: 300, width: 420, height: 140,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s3-strategy', '<strong>Strategy</strong><br/>Analyze competitor moves from public data<br/>Summarize 100-page reports in 2 minutes (Claude)<br/>Model scenarios and financial projections', {
        left: 520, top: 300, width: 420, height: 140,
        fontSize: '14', color: '#e2e8f0',
      }),
      textEl('d3s1-s3-bottom', 'Key insight: AI amplifies your team \u2014 it doesn\'t replace it. The best results come from human + AI collaboration.', {
        left: 80, top: 475, width: 840, height: 45,
        fontSize: '15', bold: true, color: '#a78bfa',
      }),
    ], '#0f172a'),
  } as SlideContent,
  actions: [
    speechAction('d3s1c-a1', 'Let\'s look at real use cases by department. Marketing teams can generate 50 ad variations in 10 minutes. Sales teams can auto-research prospects before calls. Operations can automate invoice processing. And strategy teams can summarize 100-page reports in 2 minutes. Remember: AI amplifies your team, it doesn\'t replace it.'),
    spotlightAction('d3s1c-a2', 'd3s1-s3-bottom'),
  ],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

// Scene 2 — Interactive: AI Tool Selector
const AI_TOOL_SELECTOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Tool Selector</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    color: #e2e8f0;
    min-height: 100vh;
    padding: 24px;
  }
  .container { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; color: #60a5fa; margin-bottom: 4px; }
  .subtitle { font-size: 14px; color: #94a3b8; margin-bottom: 28px; }
  .step-indicator { display: flex; gap: 8px; margin-bottom: 24px; }
  .step-dot { width: 32px; height: 4px; border-radius: 2px; background: #334155; transition: background 0.3s; }
  .step-dot.active { background: #3b82f6; }
  .step-dot.done { background: #22c55e; }
  .card {
    background: rgba(30, 41, 59, 0.8); border: 1px solid #334155;
    border-radius: 16px; padding: 28px; backdrop-filter: blur(12px);
  }
  .card h2 { font-size: 20px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
  .card .desc { font-size: 14px; color: #94a3b8; margin-bottom: 20px; }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .option {
    padding: 16px; border-radius: 12px; border: 2px solid #334155;
    background: rgba(15, 23, 42, 0.6); cursor: pointer;
    transition: all 0.2s; text-align: center;
  }
  .option:hover { border-color: #3b82f6; background: rgba(59, 130, 246, 0.08); }
  .option.selected { border-color: #3b82f6; background: rgba(59, 130, 246, 0.15); }
  .option .icon { font-size: 28px; margin-bottom: 8px; display: block; }
  .option .label { font-size: 14px; font-weight: 600; color: #f1f5f9; }
  .option .sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .btn-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .btn {
    padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; transition: all 0.2s;
  }
  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover { background: #2563eb; }
  .btn-secondary { background: #334155; color: #94a3b8; }
  .btn-secondary:hover { background: #475569; color: #e2e8f0; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .results { display: none; }
  .results.show { display: block; }
  .tool-card {
    background: rgba(15, 23, 42, 0.6); border: 1px solid #334155;
    border-radius: 14px; padding: 20px; margin-bottom: 12px;
    transition: border-color 0.2s;
  }
  .tool-card:hover { border-color: #3b82f6; }
  .tool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .tool-name { font-size: 18px; font-weight: 700; color: #f1f5f9; }
  .tool-badge {
    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .badge-best { background: #22c55e20; color: #4ade80; border: 1px solid #22c55e40; }
  .badge-alt { background: #3b82f620; color: #60a5fa; border: 1px solid #3b82f640; }
  .tool-desc { font-size: 14px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.5; }
  .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pros h4, .cons h4 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .pros h4 { color: #4ade80; }
  .cons h4 { color: #f87171; }
  .pros li, .cons li { font-size: 13px; color: #94a3b8; margin-bottom: 3px; list-style: none; }
  .price { font-size: 13px; color: #a78bfa; margin-top: 10px; font-weight: 500; }
  .restart-btn {
    display: inline-block; margin-top: 20px; padding: 10px 24px;
    background: #334155; color: #94a3b8; border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  }
  .restart-btn:hover { background: #475569; color: #e2e8f0; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="container">
  <h1>AI Tool Selector</h1>
  <p class="subtitle">Answer 3 quick questions to get personalized AI tool recommendations</p>

  <div class="step-indicator" id="steps">
    <div class="step-dot active" id="step1"></div>
    <div class="step-dot" id="step2"></div>
    <div class="step-dot" id="step3"></div>
  </div>

  <div id="questionArea" class="card">
    <h2 id="qTitle"></h2>
    <p class="desc" id="qDesc"></p>
    <div class="options" id="optionsGrid"></div>
    <div class="btn-row">
      <button class="btn btn-secondary hidden" id="backBtn">Back</button>
      <button class="btn btn-primary" id="nextBtn" disabled>Next</button>
    </div>
  </div>

  <div id="resultsArea" class="results">
    <div class="card">
      <h2>Your Recommended AI Stack</h2>
      <p class="desc" id="resultsDesc"></p>
      <div id="toolCards"></div>
      <button class="restart-btn" id="restartBtn">Start Over</button>
    </div>
  </div>
</div>

<script>
(function() {
  var questions = [
    {
      title: "What's your primary business need?",
      desc: "Select the area where you'd benefit most from AI assistance.",
      options: [
        { id: 'content', icon: '\\u270d\\ufe0f', label: 'Content & Marketing', sub: 'Blog posts, ads, social media' },
        { id: 'sales', icon: '\\ud83d\\udcb0', label: 'Sales & Outreach', sub: 'Lead gen, prospecting, CRM' },
        { id: 'data', icon: '\\ud83d\\udcca', label: 'Data & Analytics', sub: 'Reports, dashboards, insights' },
        { id: 'ops', icon: '\\u2699\\ufe0f', label: 'Operations & Automation', sub: 'Workflows, processes, admin' },
      ]
    },
    {
      title: "What's your team size?",
      desc: "This helps us recommend tools that fit your scale and budget.",
      options: [
        { id: 'solo', icon: '\\ud83d\\udc64', label: 'Solo / Freelancer', sub: 'Just me' },
        { id: 'small', icon: '\\ud83d\\udc65', label: 'Small Team (2-10)', sub: 'Early stage startup' },
        { id: 'medium', icon: '\\ud83c\\udfe2', label: 'Medium (11-50)', sub: 'Growing company' },
        { id: 'large', icon: '\\ud83c\\udfd9\\ufe0f', label: 'Large (50+)', sub: 'Established business' },
      ]
    },
    {
      title: "What's your monthly AI budget?",
      desc: "Many powerful tools have free tiers, but paid plans unlock more value.",
      options: [
        { id: 'free', icon: '\\ud83c\\udd93', label: 'Free Only', sub: '$0/month' },
        { id: 'starter', icon: '\\ud83d\\udcb5', label: 'Starter', sub: '$20-100/month' },
        { id: 'growth', icon: '\\ud83d\\udcb0', label: 'Growth', sub: '$100-500/month' },
        { id: 'enterprise', icon: '\\ud83d\\udc8e', label: 'Enterprise', sub: '$500+/month' },
      ]
    }
  ];

  var toolDB = {
    content: {
      best: { name: 'Claude + Jasper', desc: 'Use Claude for strategy, research, and long-form writing. Jasper for short-form marketing copy, ads, and social media content at scale.', pros: ['Best reasoning for strategy content', 'Jasper excels at ad copy', 'Both integrate with your workflow'], cons: ['Two subscriptions needed', 'Learning curve for prompting', 'Jasper can feel formulaic'], price: 'Claude Pro: $20/mo + Jasper: $49/mo' },
      alt: { name: 'ChatGPT + Canva AI', desc: 'ChatGPT handles text content while Canva AI creates matching visuals. Great all-in-one solution for solo creators.', pros: ['Visual + text in one workflow', 'Easy to learn', 'Good free tiers'], cons: ['Less specialized than dedicated tools', 'Visual AI quality varies', 'Limited brand voice control'], price: 'ChatGPT Plus: $20/mo + Canva Pro: $13/mo' },
      budget: { name: 'Claude (Free) + Canva Free', desc: "Claude's free tier is powerful for content creation. Pair with Canva's free plan for basic visuals.", pros: ['Completely free to start', 'Claude free tier is generous', 'Good enough for most needs'], cons: ['Usage limits apply', 'No team features', 'Manual workflow'], price: 'Free' },
    },
    sales: {
      best: { name: 'Apollo + Clay + Gong', desc: 'Apollo for lead database and outreach, Clay for automated prospect research, Gong for call intelligence. The ultimate B2B sales stack.', pros: ['Massive lead database (Apollo)', 'AI-powered enrichment (Clay)', 'Call insights that close deals (Gong)'], cons: ['Expensive combined cost', 'Complex to integrate', 'Requires training'], price: 'Apollo: $49/mo + Clay: $149/mo + Gong: custom' },
      alt: { name: 'Apollo + Claude', desc: 'Apollo for lead sourcing and sequencing. Claude for personalizing outreach emails, analyzing prospects, and preparing for calls.', pros: ['Strong lead database', 'Highly personalized outreach', 'Much more affordable'], cons: ['No automatic call recording', 'Manual enrichment', 'No real-time coaching'], price: 'Apollo: $49/mo + Claude: $20/mo' },
      budget: { name: 'Apollo Free + Claude Free', desc: "Apollo's free tier gives you access to basic lead search. Use Claude to write personalized cold emails.", pros: ['Zero cost to start', 'Real prospect data', 'AI-personalized emails'], cons: ['Limited monthly credits', 'No sequences on free tier', 'Manual process'], price: 'Free' },
    },
    data: {
      best: { name: 'Julius + Hex', desc: 'Julius for instant data analysis with natural language. Hex for collaborative notebooks that combine SQL, Python, and AI in one place.', pros: ['Ask questions in plain English', 'Beautiful auto-generated charts', 'Team collaboration built-in'], cons: ['Learning curve for Hex', 'Can be expensive at scale', 'Data privacy considerations'], price: 'Julius: $20/mo + Hex: $28/mo' },
      alt: { name: 'Claude + Google Sheets', desc: 'Upload CSVs to Claude for instant analysis and insights. Export results to Google Sheets for sharing and dashboards.', pros: ['Works with any data format', 'Excellent reasoning about data', 'No extra tool to learn'], cons: ['File size limits', 'Not real-time', 'Manual export step'], price: 'Claude Pro: $20/mo' },
      budget: { name: 'Claude Free + Google Sheets', desc: "Use Claude's free tier to analyze data and generate insights. Google Sheets for visualization and sharing.", pros: ['Completely free', 'Surprisingly powerful analysis', 'Easy to share results'], cons: ['Upload limits', 'No persistent connections', 'Basic visualization only'], price: 'Free' },
    },
    ops: {
      best: { name: 'n8n + Claude API', desc: "n8n is the most flexible automation platform. Connect it to Claude's API for AI-powered decision making in your workflows.", pros: ['Self-hosted option (data control)', 'Unlimited workflow complexity', 'AI logic in every automation'], cons: ['Requires technical setup', 'API costs can add up', 'Steeper learning curve'], price: 'n8n: $20/mo + Claude API: usage-based' },
      alt: { name: 'Zapier AI + Make', desc: "Zapier's AI features for simple automations. Make (formerly Integromat) for complex multi-step workflows.", pros: ['No-code friendly', 'Huge integration library', 'AI built into Zapier'], cons: ['Can get expensive at scale', 'Less flexible than n8n', 'Vendor lock-in'], price: 'Zapier: $20/mo + Make: $9/mo' },
      budget: { name: 'n8n Self-Hosted + Claude Free', desc: "Host n8n for free on your own server. Use Claude's free tier for occasional AI-powered decisions.", pros: ['n8n is free self-hosted', 'Full control over data', 'Powerful automation'], cons: ['Requires server management', 'Limited AI integration', 'Technical skills needed'], price: 'Free (+ server costs ~$5/mo)' },
    }
  };

  var currentStep = 0;
  var answers = [];

  var qTitle = document.getElementById('qTitle');
  var qDesc = document.getElementById('qDesc');
  var optionsGrid = document.getElementById('optionsGrid');
  var backBtn = document.getElementById('backBtn');
  var nextBtn = document.getElementById('nextBtn');
  var questionArea = document.getElementById('questionArea');
  var resultsArea = document.getElementById('resultsArea');

  function render() {
    var q = questions[currentStep];
    qTitle.textContent = q.title;
    qDesc.textContent = q.desc;
    backBtn.classList.toggle('hidden', currentStep === 0);
    nextBtn.disabled = !answers[currentStep];
    nextBtn.textContent = currentStep === 2 ? 'Get Results' : 'Next';

    for (var i = 0; i < 3; i++) {
      var dot = document.getElementById('step' + (i + 1));
      dot.className = 'step-dot' + (i < currentStep ? ' done' : i === currentStep ? ' active' : '');
    }

    optionsGrid.textContent = '';
    q.options.forEach(function(o) {
      var div = document.createElement('div');
      div.className = 'option' + (answers[currentStep] === o.id ? ' selected' : '');
      var iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = o.icon;
      var labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = o.label;
      var subDiv = document.createElement('div');
      subDiv.className = 'sub';
      subDiv.textContent = o.sub;
      div.appendChild(iconSpan);
      div.appendChild(labelDiv);
      div.appendChild(subDiv);
      div.addEventListener('click', function() { answers[currentStep] = o.id; render(); });
      optionsGrid.appendChild(div);
    });
  }

  nextBtn.addEventListener('click', function() {
    if (!answers[currentStep]) return;
    if (currentStep < 2) { currentStep++; render(); }
    else showResults();
  });

  backBtn.addEventListener('click', function() {
    if (currentStep > 0) { currentStep--; render(); }
  });

  function showResults() {
    questionArea.classList.add('hidden');
    resultsArea.classList.add('show');

    var need = answers[0];
    var size = answers[1];
    var budget = answers[2];

    var tools = toolDB[need];
    var recs = [];

    if (budget === 'free') {
      recs = [{ rec: tools.budget, badge: 'Best Match', cls: 'badge-best' }];
      if (tools.alt) recs.push({ rec: tools.alt, badge: 'Upgrade Option', cls: 'badge-alt' });
    } else if (budget === 'starter') {
      recs = [
        { rec: tools.alt, badge: 'Best Match', cls: 'badge-best' },
        { rec: tools.budget, badge: 'Budget Option', cls: 'badge-alt' },
      ];
    } else {
      recs = [
        { rec: tools.best, badge: 'Best Match', cls: 'badge-best' },
        { rec: tools.alt, badge: 'Alternative', cls: 'badge-alt' },
      ];
    }

    var sizeLabels = { solo: 'a solo professional', small: 'a small team', medium: 'a medium-sized team', large: 'a large organization' };
    var needLabels = { content: 'content & marketing', sales: 'sales & outreach', data: 'data & analytics', ops: 'operations & automation' };
    document.getElementById('resultsDesc').textContent = 'Based on your needs in ' + needLabels[need] + ' as ' + sizeLabels[size] + ':';

    var container = document.getElementById('toolCards');
    container.textContent = '';
    recs.forEach(function(item) {
      var r = item.rec;
      var card = document.createElement('div');
      card.className = 'tool-card';

      var header = document.createElement('div');
      header.className = 'tool-header';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'tool-name';
      nameSpan.textContent = r.name;
      var badgeSpan = document.createElement('span');
      badgeSpan.className = 'tool-badge ' + item.cls;
      badgeSpan.textContent = item.badge;
      header.appendChild(nameSpan);
      header.appendChild(badgeSpan);
      card.appendChild(header);

      var desc = document.createElement('div');
      desc.className = 'tool-desc';
      desc.textContent = r.desc;
      card.appendChild(desc);

      var pc = document.createElement('div');
      pc.className = 'pros-cons';
      var prosDiv = document.createElement('div');
      prosDiv.className = 'pros';
      var prosH4 = document.createElement('h4');
      prosH4.textContent = 'Pros';
      prosDiv.appendChild(prosH4);
      var prosUl = document.createElement('ul');
      r.pros.forEach(function(p) { var li = document.createElement('li'); li.textContent = p; prosUl.appendChild(li); });
      prosDiv.appendChild(prosUl);

      var consDiv = document.createElement('div');
      consDiv.className = 'cons';
      var consH4 = document.createElement('h4');
      consH4.textContent = 'Cons';
      consDiv.appendChild(consH4);
      var consUl = document.createElement('ul');
      r.cons.forEach(function(c) { var li = document.createElement('li'); li.textContent = c; consUl.appendChild(li); });
      consDiv.appendChild(consUl);

      pc.appendChild(prosDiv);
      pc.appendChild(consDiv);
      card.appendChild(pc);

      var price = document.createElement('div');
      price.className = 'price';
      price.textContent = r.price;
      card.appendChild(price);

      container.appendChild(card);
    });
  }

  document.getElementById('restartBtn').addEventListener('click', function() {
    currentStep = 0;
    answers = [];
    questionArea.classList.remove('hidden');
    resultsArea.classList.remove('show');
    render();
  });

  render();
})();
</script>
</body>
</html>`;

const demo3Scene2: SceneRecord = {
  id: 'demo-en-scene-2',
  stageId: DEMO3_STAGE_ID,
  type: 'interactive',
  title: 'AI Tool Selector',
  order: 3,
  content: {
    type: 'interactive',
    url: '',
    html: AI_TOOL_SELECTOR_HTML,
  } as InteractiveContent,
  actions: [
    speechAction('d3s2-a1', 'Now let\'s find the right AI tools for your specific needs. This interactive selector will ask you three quick questions about your business need, team size, and budget, then recommend a personalized AI stack with pros and cons for each tool.'),
  ],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

// Scene 3 — Quiz: AI applications in business
const demo3Scene3: SceneRecord = {
  id: 'demo-en-scene-3',
  stageId: DEMO3_STAGE_ID,
  type: 'quiz',
  title: 'Quiz \u2014 AI Applications in Business',
  order: 4,
  content: {
    type: 'quiz',
    questions: [
      {
        id: 'q1-en',
        type: 'single',
        question: 'Which AI application typically delivers the highest ROI for small businesses?',
        options: [
          { label: 'AI-generated video ads', value: 'A' },
          { label: 'AI-assisted email marketing and customer segmentation', value: 'B' },
          { label: 'Fully autonomous AI customer support', value: 'C' },
          { label: 'AI-powered office design', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'AI-assisted email marketing and customer segmentation consistently delivers the highest ROI for small businesses. It combines the proven high-ROI channel (email) with AI\'s ability to personalize at scale. Segmenting customers by behavior and preferences can increase email revenue by 760%.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q2-en',
        type: 'single',
        question: 'What is the most important principle when implementing AI tools in a team?',
        options: [
          { label: 'Replace as many human roles as possible', value: 'A' },
          { label: 'Buy the most expensive enterprise tools', value: 'B' },
          { label: 'Start with one use case, prove value, then expand', value: 'C' },
          { label: 'Implement all AI tools simultaneously for maximum impact', value: 'D' },
        ],
        answer: ['C'],
        analysis: 'The most successful AI implementations follow an incremental approach: start with one high-impact use case, measure results, build team confidence, then expand. Trying to transform everything at once leads to change fatigue, poor adoption, and wasted budget.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q3-en',
        type: 'short_answer',
        question: 'Describe one specific way you could use an AI assistant (like Claude) to save at least 5 hours per week in your current role.',
        commentPrompt: 'Look for a specific, realistic use case with a clear before/after comparison. Good answers mention a concrete task (e.g., writing meeting summaries, drafting proposals, analyzing spreadsheets), how they currently do it, and how AI would help.',
        analysis: 'Common high-impact examples include: drafting meeting summaries from notes (saves 3-4 hours/week), writing first drafts of proposals and reports (saves 5-8 hours/week), analyzing spreadsheet data and creating summaries (saves 2-3 hours/week), researching competitors or market trends (saves 4-5 hours/week), and generating personalized email responses (saves 2-3 hours/week).',
        hasAnswer: false,
        points: 3,
      },
      {
        id: 'q4-en',
        type: 'single',
        question: 'Which of these is a legitimate concern when adopting AI tools for business?',
        options: [
          { label: 'AI tools are too expensive for any small business', value: 'A' },
          { label: 'Sensitive business data shared with AI providers may create privacy and compliance risks', value: 'B' },
          { label: 'AI tools only work for technology companies', value: 'C' },
          { label: 'AI will make all business decisions autonomously within 2 years', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'Data privacy and compliance is a real and important concern. When using AI tools, sensitive business data (customer info, financial data, trade secrets) may be processed by third-party providers. Companies should review AI providers\' data policies, consider on-premise solutions for sensitive data, and ensure compliance with GDPR, CCPA, and other regulations.',
        hasAnswer: true,
        points: 2,
      },
      {
        id: 'q5-en',
        type: 'single',
        question: 'What does "prompt engineering" refer to in the context of business AI?',
        options: [
          { label: 'Writing code that powers AI models', value: 'A' },
          { label: 'The skill of crafting effective instructions to get better outputs from AI tools', value: 'B' },
          { label: 'Engineering a new AI model from scratch', value: 'C' },
          { label: 'Automating customer service prompts', value: 'D' },
        ],
        answer: ['B'],
        analysis: 'Prompt engineering is the skill of writing clear, specific instructions that help AI tools produce better results. In a business context, this means learning to give AI enough context, specifying the desired format, providing examples, and iterating on prompts. It\'s become a key professional skill \u2014 teams that invest in prompt training see 2-3x better results from the same AI tools.',
        hasAnswer: true,
        points: 2,
      },
    ],
  } as QuizContent,
  actions: [
    speechAction('d3s3-a1', 'Let\'s test your understanding of AI applications in business. This quiz covers practical implementation principles, real-world use cases, and important considerations when adopting AI tools. Take your time with each question.'),
  ],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

// ─── Export all demo data ────────────────────────────────────────

export const DEMO_STAGE_IDS = [DEMO1_STAGE_ID, DEMO2_STAGE_ID, DEMO3_STAGE_ID] as const;

export const demoStages: StageRecord[] = [demo1Stage, demo2Stage, demo3Stage];

export const demoScenes: SceneRecord[] = [
  // Demo 1 — FR
  demo1Scene1,
  demo1Scene1b,
  demo1Scene1c,
  demo1Scene2,
  demo1Scene3,
  demo1Scene4a,
  demo1Scene4b,
  demo1Scene4c,
  // Demo 2 — AR
  demo2Scene1a,
  demo2Scene1b,
  demo2Scene1c,
  demo2Scene2,
  demo2Scene3a,
  demo2Scene3b,
  demo2Scene3c,
  // Demo 3 — EN
  demo3Scene1a,
  demo3Scene1b,
  demo3Scene1c,
  demo3Scene2,
  demo3Scene3,
];
