-- =============================================================================
-- Qalem — Seed Classroom Templates (System-level, org_id IS NULL)
-- =============================================================================

-- Healthcare
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Formation infirmière',
  'healthcare',
  'Parcours de formation en soins infirmiers : évaluation clinique, protocoles de soins et communication avec le patient.',
  '{"requirement": "Créer un cours interactif sur les fondamentaux des soins infirmiers : évaluation clinique du patient, prise des constantes vitales, administration des médicaments et communication empathique avec les patients et les familles.", "sceneTypes": ["slide", "quiz", "interactive"]}'::jsonb,
  ARRAY['healthcare-basics'],
  'fr-FR'
),
(
  'Protocole d''urgence',
  'healthcare',
  'Formation aux protocoles d''urgence médicale : triage, réanimation cardio-pulmonaire et gestion des situations critiques.',
  '{"requirement": "Concevoir une formation interactive sur les protocoles d''urgence : triage selon la méthode START, réanimation cardio-pulmonaire (RCP) selon les recommandations de l''ERC, gestion du chariot d''urgence et coordination de l''équipe soignante.", "sceneTypes": ["slide", "quiz", "interactive", "pbl"]}'::jsonb,
  ARRAY['healthcare-basics'],
  'fr-FR'
);

-- Legal
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Droit du travail marocain',
  'legal',
  'Introduction au Code du travail marocain : contrats, droits des salariés, procédure de licenciement et instances représentatives.',
  '{"requirement": "Élaborer un cours sur le droit du travail au Maroc : types de contrats (CDD, CDI, intérim), droits et obligations du salarié et de l''employeur, procédures de licenciement, rôle de l''inspecteur du travail et instances représentatives du personnel.", "sceneTypes": ["slide", "quiz", "interactive"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
),
(
  'Introduction au RGPD',
  'legal',
  'Comprendre le Règlement général sur la protection des données : principes, droits des personnes et obligations des responsables de traitement.',
  '{"requirement": "Créer une formation sur le RGPD : principes fondamentaux (licéité, minimisation, exactitude), droits des personnes concernées (accès, rectification, effacement, portabilité), obligations du responsable de traitement, analyse d''impact et rôle du DPO.", "sceneTypes": ["slide", "quiz", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
);

-- Tech
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Onboarding Next.js',
  'tech',
  'Prise en main de Next.js : routing App Router, Server Components, data fetching et déploiement sur Vercel.',
  '{"requirement": "Concevoir un parcours d''onboarding Next.js 14+ : architecture App Router, Server Components vs Client Components, data fetching (fetch, server actions), middleware, gestion des erreurs et déploiement sur Vercel.", "sceneTypes": ["slide", "quiz", "interactive"]}'::jsonb,
  ARRAY[]::text[],
  'en-US'
),
(
  'Architecture Cloud AWS',
  'tech',
  'Fondamentaux de l''architecture cloud sur AWS : VPC, EC2, S3, RDS, Lambda et bonnes pratiques de sécurité.',
  '{"requirement": "Créer une formation sur l''architecture cloud AWS : conception de VPC, déploiement EC2 et auto-scaling, stockage S3 et politiques d''accès, bases de données RDS et DynamoDB, fonctions Lambda et API Gateway, IAM et bonnes pratiques de sécurité.", "sceneTypes": ["slide", "quiz", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
);

-- Finance
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Analyse financière',
  'finance',
  'Maîtriser les outils d''analyse financière : ratios, bilan, compte de résultat et tableaux de flux de trésorerie.',
  '{"requirement": "Élaborer un cours d''analyse financière : lecture et interprétation du bilan et du compte de résultat, calcul et analyse des ratios financiers (liquidité, rentabilité, solvabilité), construction du tableau de flux de trésorerie et diagnostic financier global.", "sceneTypes": ["slide", "quiz", "interactive"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
),
(
  'Gestion des risques',
  'finance',
  'Introduction à la gestion des risques financiers : identification, évaluation, stratégies de couverture et conformité réglementaire.',
  '{"requirement": "Concevoir une formation sur la gestion des risques financiers : identification et cartographie des risques (marché, crédit, opérationnel, liquidité), méthodes d''évaluation (VaR, stress tests), stratégies de couverture et conformité avec les normes Bâle III.", "sceneTypes": ["slide", "quiz", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
);

-- Education
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Pédagogie active',
  'education',
  'Découvrir les méthodes de pédagogie active : apprentissage par problèmes, classe inversée et évaluation formative.',
  '{"requirement": "Créer un cours sur les méthodes de pédagogie active : apprentissage par problèmes (APP), classe inversée, travail collaboratif, évaluation formative et sommative, différenciation pédagogique et intégration des outils numériques.", "sceneTypes": ["slide", "quiz", "interactive", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
),
(
  'Conception de cours',
  'education',
  'Méthodologie de conception pédagogique : objectifs d''apprentissage, alignement constructif et scénarisation.',
  '{"requirement": "Élaborer une formation sur la conception pédagogique : rédaction d''objectifs d''apprentissage selon la taxonomie de Bloom, alignement constructif, scénarisation de séquences, choix des activités et des ressources, évaluation des acquis.", "sceneTypes": ["slide", "quiz", "interactive"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
);

-- Industry
INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES
(
  'Sécurité industrielle',
  'industry',
  'Formation à la sécurité industrielle : analyse des risques, EPI, procédures d''urgence et culture sécurité.',
  '{"requirement": "Concevoir une formation sur la sécurité industrielle : identification et analyse des risques (AMDEC, arbre des causes), équipements de protection individuelle (EPI), procédures de consignation/déconsignation, plans d''urgence et développement d''une culture sécurité.", "sceneTypes": ["slide", "quiz", "interactive", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
),
(
  'Lean Manufacturing',
  'industry',
  'Introduction au Lean Manufacturing : élimination des gaspillages, 5S, Kaizen, Kanban et amélioration continue.',
  '{"requirement": "Créer un parcours de formation Lean Manufacturing : les 7 gaspillages (muda), méthode 5S, démarche Kaizen, système Kanban, cartographie de la chaîne de valeur (VSM) et indicateurs de performance (TRS, lead time).", "sceneTypes": ["slide", "quiz", "pbl"]}'::jsonb,
  ARRAY[]::text[],
  'fr-FR'
);
