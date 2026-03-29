-- =============================================================================
-- Qalem — Seed Entrepreneurship Courses (System-level, org_id IS NULL)
-- 10 cours progressifs et complementaires couvrant l'entrepreneuriat de A a Z
-- Adaptes a l'ecosysteme startup nord-africain (Maroc, Tunisie, Algerie, Egypte, Libye)
-- Approche andragogique : 30 % theorie / 70 % pratique
-- Trois blocs : FR (fr-FR), AR (ar-MA), EN (en-US)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 1 — FRANCAIS (fr-FR)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES

-- ── 1. De l'Idee au Projet ──────────────────────────────────────────────────
(
  'De l''Idée au Projet',
  'entrepreneurship',
  'Apprenez à valider une idée de startup dans le contexte nord-africain : étude de marché locale, lean canvas et confrontation terrain. Cas réels issus de l''écosystème Maroc-Tunisie-Algérie.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur la validation d''idée entrepreneuriale dans l''écosystème nord-africain.\n\nModule 1 — Identifier un problème réel : observation terrain, entretiens exploratoires (méthode Mom Test), cartographie des irritants locaux (mobilité urbaine, accès aux services financiers, logistique du dernier kilomètre au Maghreb). Activité : sortie terrain simulée avec grille d''observation.\n\nModule 2 — Lean Canvas et proposition de valeur : remplir un Lean Canvas étape par étape. Cas réel : comment Chari (Maroc) a identifié le problème de la distribution FMCG dans les épiceries de quartier. Activité : atelier collaboratif — chaque apprenant construit son Lean Canvas et le soumet à un peer review croisé.\n\nModule 3 — Étude de marché locale : sources de données nord-africaines (HCP Maroc, INS Tunisie, ONS Algérie), estimation du TAM/SAM/SOM dans des marchés à données limitées. Cas réel : comment Yassir a dimensionné le marché VTC en Algérie avant lancement. Activité : exercice de dimensionnement de marché sur un cas fictif maghrébin.\n\nModule 4 — Prototypage rapide et test : MVP paper prototype, landing page test, concierge MVP. Cas réel : InstaDeep et la validation de leur offre IA auprès des premiers clients B2B en Tunisie. Activité : construire un prototype papier et le tester auprès de 5 personnes (simulation en binôme).\n\nModule 5 — Décision Go / No-Go : grille de scoring multicritères, pivot ou persévérance. Atelier de simulation : comité de décision avec rôles (fondateur, investisseur, client).\n\nÉvaluation (alignée Kirkpatrick) : Niveau 1 — questionnaire de satisfaction. Niveau 2 — quiz sur le Lean Canvas et la méthode Mom Test. Niveau 3 — soumission d''un Lean Canvas complet pour un projet personnel. Niveau 4 — suivi à 3 mois : l''idée a-t-elle été testée sur le terrain ?\n\nPrincipes andragogiques : apprentissage expérientiel (Kolb), problèmes authentiques nord-africains, peer learning systématique, réflexion métacognitive en fin de module.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 2. Business Model & Proposition de Valeur ───────────────────────────────
(
  'Business Model & Proposition de Valeur',
  'entrepreneurship',
  'Maîtrisez le Business Model Canvas et le Value Proposition Design pour construire un modèle économique viable dans les marchés nord-africains. Études de cas : Hmizate, Jumia Maroc, Expensya.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur la construction de business models adaptés aux marchés nord-africains.\n\nModule 1 — Business Model Canvas (BMC) : les 9 blocs, interdépendances et lecture stratégique. Cas réel : déconstruction du BMC de Jumia Maroc (marketplace e-commerce, défis logistiques, cash on delivery dominant). Activité : remplir le BMC d''une startup fictive opérant dans le e-commerce alimentaire à Casablanca.\n\nModule 2 — Value Proposition Design : jobs-to-be-done, pains, gains et fit produit-marché. Cas réel : comment Expensya (Tunisie) a conçu sa proposition de valeur pour la gestion des notes de frais en entreprise. Activité : atelier Value Proposition Canvas en binôme avec échange et critique constructive.\n\nModule 3 — Modèles de revenus adaptés au Maghreb : freemium, commission, abonnement, pay-per-use. Spécificités : faible pénétration carte bancaire, cash economy, mobile money émergent. Cas réel : Hmizate et le modèle deal-of-the-day au Maroc — succès initial et pivot. Activité : simulation de pricing pour trois segments clients maghrébins.\n\nModule 4 — Tester et itérer son business model : hypothèses critiques, expériences de validation, métriques clés. Outils : Strategyzer Test Card. Cas réel : comment Heetch a testé puis pivoté son modèle au Maroc face à la réglementation VTC. Activité : rédiger 5 hypothèses critiques et concevoir une expérience de validation pour chacune.\n\nModule 5 — Pivot stratégique : quand et comment pivoter. Types de pivots (zoom-in, customer segment, platform). Cas réel : InstaDeep — du consulting IA au produit deeptech. Atelier : jeu de rôle — le board challenge le fondateur sur son pivot.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback à chaud. Niveau 2 — quiz BMC et VPC. Niveau 3 — livrable : BMC complet et argumenté pour un projet réel. Niveau 4 — le modèle a-t-il été confronté à des clients réels dans les 3 mois ?\n\nPrincipes andragogiques : cas authentiques nord-africains, apprentissage par les pairs (peer review systématique), projet fil rouge individuel, réflexion critique sur les spécificités culturelles et économiques du Maghreb.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 3. Cadre Juridique & Création d'Entreprise ─────────────────────────────
(
  'Cadre Juridique & Création d''Entreprise',
  'entrepreneurship',
  'Naviguez dans les formalités de création d''entreprise au Maroc, en Tunisie et en Algérie : statuts juridiques, fiscalité startup, Startup Act et démarches administratives concrètes.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur le cadre juridique et administratif de la création d''entreprise en Afrique du Nord.\n\nModule 1 — Choisir son statut juridique : SARL, SAS, SA, auto-entrepreneur (Maroc), SUARL (Tunisie), EURL/SARL (Algérie). Comparatif des régimes : capital minimum, responsabilité, gouvernance, charges sociales. Activité : quiz interactif — quel statut pour quel projet ? Simulation de choix pour 4 profils de startups.\n\nModule 2 — Démarches de création au Maroc : CRI (Centre Régional d''Investissement), registre de commerce, CNSS, immatriculation fiscale, patente. Focus : le guichet unique et les délais réels. Activité : remplir un dossier de création SARL complet (formulaires réels simplifiés).\n\nModule 3 — Démarches en Tunisie et Algérie : API Tunisie, Startup Act tunisien (label startup, avantages fiscaux, congé entrepreneuriat, bourse), CNRC Algérie, ANSEJ/ANADE. Activité : étude comparative — créer la même startup à Tunis vs Alger vs Casablanca (coûts, délais, avantages).\n\nModule 4 — Fiscalité startup : IS, IR, TVA, cotisations sociales. Dispositifs incitatifs : Startup Act Tunisie, Maroc PME, statut CFC Casablanca Finance City, régime forfaitaire. Cas réel : comment une fintech tunisienne a bénéficié du label Startup Act. Activité : simulation fiscale — calculer les charges de la première année pour trois scénarios.\n\nModule 5 — Propriété intellectuelle et contrats : marques (OMPIC, INNORPI, INAPI), brevets, contrats d''association, pacte d''actionnaires. Cas réel : litige entre cofondateurs — étude de cas et leçons. Activité : rédiger les grandes lignes d''un pacte d''actionnaires en utilisant un template.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — satisfaction. Niveau 2 — quiz sur les statuts et la fiscalité. Niveau 3 — livrable : dossier de création complet pour un projet personnel (statut choisi et justifié, simulation fiscale). Niveau 4 — la structure a-t-elle été effectivement créée dans les 6 mois ?\n\nPrincipes andragogiques : comparaisons transnationales Maghreb, documents réels simplifiés, apprentissage par la pratique administrative, témoignages d''entrepreneurs sur les pièges à éviter.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 4. Finance & Comptabilité pour Entrepreneurs ────────────────────────────
(
  'Finance & Comptabilité pour Entrepreneurs',
  'entrepreneurship',
  'Maîtrisez les fondamentaux financiers indispensables : trésorerie, seuil de rentabilité, lecture des états financiers et gestion du BFR, avec les spécificités bancaires du Maghreb.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur la finance et la comptabilité pour entrepreneurs non-financiers en Afrique du Nord.\n\nModule 1 — Lire et comprendre les états financiers : bilan, compte de résultat, tableau de flux de trésorerie. Démystification pour non-comptables. Cas réel : analyser les états financiers publiés d''une PME marocaine cotée (Maroc Telecom ou Mutandis). Activité : exercice de lecture commentée d''un bilan réel simplifié.\n\nModule 2 — Trésorerie et survie : plan de trésorerie prévisionnel, gestion du cash au quotidien, délais de paiement (problématique majeure au Maghreb : 90-120 jours courants). Cas réel : une startup marocaine en croissance qui a frôlé la cessation de paiement malgré un carnet de commandes plein. Activité : construire un plan de trésorerie sur 12 mois avec des hypothèses réalistes.\n\nModule 3 — Seuil de rentabilité et pricing : charges fixes vs variables, calcul du point mort, marges. Spécificités : marchés à faible pouvoir d''achat, pression sur les prix, économie informelle concurrente. Activité : simulation — trouver le prix juste pour un SaaS B2B au Maghreb et calculer le point mort.\n\nModule 4 — BFR et financement du cycle d''exploitation : comprendre le besoin en fonds de roulement, optimiser le BFR, négocier avec les banques maghrébines (garanties exigées, taux d''intérêt, crédit Mourabaha et finance islamique). Activité : jeu de rôle — négociation bancaire (entrepreneur vs banquier) avec brief confidentiel pour chaque rôle.\n\nModule 5 — Tableaux de bord et KPI : construire un dashboard financier de startup, métriques SaaS (MRR, churn, LTV/CAC), métriques commerce (panier moyen, rotation des stocks). Activité : construire son propre tableau de bord sur un template Excel/Sheets.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback. Niveau 2 — quiz sur les concepts financiers. Niveau 3 — livrable : plan de trésorerie 12 mois et tableau de bord pour son projet. Niveau 4 — l''entrepreneur utilise-t-il activement son tableau de bord 3 mois après ?\n\nPrincipes andragogiques : démystification (pas de jargon inutile), cas maghrébins concrets, jeux de rôle (négociation bancaire), outils immédiatement réutilisables (templates), peer feedback sur les livrables.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 5. Marketing Digital & Growth Hacking ───────────────────────────────────
(
  'Marketing Digital & Growth Hacking',
  'entrepreneurship',
  'Déployez une stratégie de marketing digital efficace au Maghreb : SEO/SEA, Facebook et WhatsApp Business, influence marketing local et growth hacking à petit budget.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur le marketing digital et le growth hacking adaptés à l''Afrique du Nord.\n\nModule 1 — Écosystème digital nord-africain : pénétration internet et mobile, plateformes dominantes (Facebook largement n°1, Instagram en croissance, TikTok explosif chez les jeunes, faible usage de Twitter/X), comportements d''achat en ligne, freins (confiance, paiement, livraison). Activité : audit digital d''un concurrent local — analyser sa présence en ligne avec des outils gratuits.\n\nModule 2 — SEO et content marketing pour le Maghreb : SEO en français et arabe (darija incluse), Google My Business pour le commerce local, blogging et content marketing adapté. Cas réel : comment DabaDoc a construit son trafic organique au Maroc grâce au contenu santé. Activité : définir une stratégie de mots-clés bilingue (FR/AR) pour un projet.\n\nModule 3 — Publicité digitale (SEA et Social Ads) : Facebook Ads (ciblage Maghreb, budgets réalistes : 5-20 USD/jour), Google Ads, Instagram Ads. Spécificités : coût par acquisition bas mais conversion difficile, importance du remarketing. Cas réel : Glovo Maroc — stratégie d''acquisition multi-canal. Activité : créer et budgétiser une campagne Facebook Ads complète pour un lancement au Maroc.\n\nModule 4 — WhatsApp Business et marketing conversationnel : WhatsApp comme canal principal de relation client en Afrique du Nord, catalogues produits, messages automatisés, WhatsApp Business API. Cas réel : comment Yassir utilise WhatsApp pour le support et la fidélisation. Activité : configurer un compte WhatsApp Business et créer un scénario de conversation client complet.\n\nModule 5 — Growth hacking à petit budget : boucles virales, referral programs, scraping éthique, partenariats croisés, influence marketing local (micro-influenceurs Maghreb). Cas réel : comment des startups marocaines ont atteint 10 000 utilisateurs sans budget publicitaire. Activité : concevoir 3 expériences de growth pour un projet, les prioriser avec le framework ICE.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback. Niveau 2 — quiz marketing digital. Niveau 3 — livrable : plan marketing digital 90 jours avec budget. Niveau 4 — métriques d''acquisition réelles après 3 mois de mise en oeuvre.\n\nPrincipes andragogiques : outils gratuits et accessibles, cas nord-africains exclusivement, apprentissage par la pratique (chaque module = un livrable concret), peer review des stratégies entre apprenants.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 6. Vente & Négociation Commerciale ──────────────────────────────────────
(
  'Vente & Négociation Commerciale',
  'entrepreneurship',
  'Développez vos compétences de vente et de négociation adaptées au contexte relationnel nord-africain : techniques B2B et B2C, pricing pour marchés émergents et négociation interculturelle.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur la vente et la négociation commerciale dans le contexte nord-africain.\n\nModule 1 — Comprendre l''acheteur nord-africain : psychologie d''achat, importance de la relation de confiance (thiqua), rôle du réseau personnel (ma3rifa), cycle de décision long en B2B, sensibilité au prix. Activité : cartographier le parcours d''achat type pour un produit B2B et un produit B2C au Maghreb.\n\nModule 2 — Techniques de vente B2B adaptées : prospection (LinkedIn, événements, réseau), rendez-vous commercial structuré (SPIN Selling adapté), gestion des objections courantes au Maghreb (« c''est trop cher », « on travaille déjà avec quelqu''un », « revenez dans un mois »). Cas réel : comment une startup SaaS marocaine a décroché ses 10 premiers clients B2B. Activité : jeu de rôle — rendez-vous de vente B2B (vendeur, acheteur, observateur) avec débriefing structuré.\n\nModule 3 — Techniques de vente B2C et retail : vente en magasin, vente en ligne, upselling et cross-selling. Spécificités : cash on delivery dominant, retours fréquents, importance des avis WhatsApp. Activité : simuler une vente en ligne complète (de l''annonce au suivi post-livraison).\n\nModule 4 — Négociation commerciale interculturelle : styles de négociation au Maghreb (relationnelle, non-linéaire, importance du thé et du temps), négociation avec des partenaires européens et du Golfe, gestion des concessions. Cadre : méthode Harvard adaptée au contexte culturel. Activité : simulation de négociation trilaterale (fournisseur marocain, client français, investisseur émirati) avec observateurs.\n\nModule 5 — Pricing et stratégie commerciale : fixer ses prix dans un marché à faible pouvoir d''achat, éviter la guerre des prix, construire de la valeur perçue, offres freemium et premium. Cas réel : stratégies de pricing de Yassir vs Careem au Maghreb. Activité : construire une grille tarifaire pour trois segments et la défendre devant le groupe.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — satisfaction et auto-évaluation. Niveau 2 — quiz négociation et vente. Niveau 3 — livrable : script de vente B2B ou B2C complet pour son projet. Niveau 4 — nombre de ventes réalisées dans les 3 mois suivants.\n\nPrincipes andragogiques : jeux de rôle intensifs (60 % du temps), cas culturellement situés, débriefing collectif après chaque simulation, apprentissage par l''erreur dans un cadre bienveillant.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 7. Levée de Fonds & Financement ─────────────────────────────────────────
(
  'Levée de Fonds & Financement',
  'entrepreneurship',
  'Explorez toutes les options de financement disponibles en Afrique du Nord : bootstrap, business angels, fonds VC, aides publiques (Intelaka, Forsa, Startup Act) et crowdfunding.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur le financement et la levée de fonds pour startups en Afrique du Nord.\n\nModule 1 — Panorama du financement en Afrique du Nord : bootstrap, love money, prêts bancaires, fonds publics, business angels, VC, crowdfunding. Cartographie de l''écosystème : Maroc Numeric Fund, 212 Founders, Azur Innovation Fund (Maroc), Flat6Labs (Tunisie/Égypte), Algeria Venture, Cairo Angels. Activité : quiz interactif — quel financement pour quelle étape ? Cartographier les options pour son propre projet.\n\nModule 2 — Aides publiques et dispositifs étatiques : programme Intelaka et Forsa (Maroc), Startup Act tunisien (8 ans d''exonération fiscale, bourse, congé entrepreneuriat), ANSEJ/ANADE (Algérie), TIEC (Égypte). Comparatif des dispositifs par pays. Cas réel : parcours d''un entrepreneur tunisien labellisé Startup Act. Activité : remplir un dossier de demande Intelaka ou Startup Act (simulation avec documents réels simplifiés).\n\nModule 3 — Préparer son pitch deck : structure d''un deck de levée (problème, solution, marché, traction, équipe, ask), storytelling adapté aux investisseurs de la région. Cas réel : analyse du pitch deck de Chari avant sa Série A. Activité : construire son pitch deck (10 slides max) et le présenter au groupe — feedback structuré par les pairs.\n\nModule 4 — Négocier avec les investisseurs : term sheet, valorisation pre/post-money, dilution, clauses (liquidation preference, anti-dilution, board seats), due diligence. Spécificités régionales : investisseurs risk-averse, importance du track record et du réseau. Activité : jeu de rôle — simulation de négociation de term sheet (fondateur vs VC) avec débriefing.\n\nModule 5 — Alternatives : crowdfunding et financement participatif : plateformes actives (Cotizi Maroc, Afrikwity, Zoomaal), equity crowdfunding, financement islamique (moudaraba, moucharaka), tontines digitalisées. Cas réel : une campagne de crowdfunding réussie en Tunisie. Activité : concevoir une campagne de crowdfunding complète (page, vidéo, contreparties, plan de communication).\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback. Niveau 2 — quiz financement et term sheet. Niveau 3 — livrable : pitch deck complet + plan de financement sur 18 mois. Niveau 4 — fonds effectivement levés ou aide obtenue dans les 6 mois.\n\nPrincipes andragogiques : cartographie personnalisée des options, simulation de pitch (pratique intensive), documents réels, peer learning et feedback de groupe, témoignages d''investisseurs locaux.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 8. Management d'Équipe & Leadership ─────────────────────────────────────
(
  'Management d''Équipe & Leadership',
  'entrepreneurship',
  'Recrutez, motivez et dirigez une équipe startup dans le contexte culturel maghrébin : recrutement, culture d''entreprise, gestion remote et leadership situationnel.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur le management d''équipe et le leadership en contexte startup nord-africain.\n\nModule 1 — Recruter en startup : attirer les talents dans un écosystème où les grandes entreprises et la fonction publique dominent, canaux de recrutement (LinkedIn, ReKrute, Emploi.tn, Bayt), entretiens structurés, culture fit vs skill fit. Spécificités : fuite des cerveaux, concurrence des salaires européens pour les développeurs, expectations salariales. Cas réel : comment Chari a structuré son recrutement lors de son hyper-croissance. Activité : rédiger une fiche de poste attractive pour un premier recrutement startup et simuler un entretien.\n\nModule 2 — Culture d''entreprise et valeurs : définir et incarner les valeurs, onboarding, rituels d''équipe. Spécificités culturelles : hiérarchie implicite, rapport à l''autorité, communication indirecte, importance du respect des aînés. Cas réel : culture d''entreprise chez Yassir — concilier croissance rapide et identité algérienne. Activité : atelier collaboratif — définir la charte culturelle de sa startup.\n\nModule 3 — Leadership situationnel : modèle de Hersey-Blanchard adapté, quand diriger, coacher, soutenir ou déléguer. Gestion des conflits dans un contexte où la confrontation directe est culturellement délicate. Activité : études de cas situationnelles — quelle posture de leadership pour chaque scénario ? Jeu de rôle avec feedback 360°.\n\nModule 4 — Management remote et équipes distribuées : outils (Slack, Notion, Linear), rituels async, gestion du temps et de la productivité, défis spécifiques (connexion internet variable, culture présentéiste, frontière vie pro/perso). Cas réel : startups tunisiennes avec équipes entre Tunis, Paris et le Canada. Activité : concevoir un système de management remote complet pour une équipe de 5 personnes.\n\nModule 5 — Rétention et développement des talents : plans de carrière en startup, equity/BSPCE/stock-options (cadre juridique limité au Maghreb), formation continue, gestion de la démotivation. Activité : construire un plan de rétention pour un développeur senior tenté par un poste en Europe.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback. Niveau 2 — quiz leadership et management. Niveau 3 — livrable : charte culturelle + plan de recrutement pour les 6 prochains mois. Niveau 4 — turnover et satisfaction d''équipe mesurés à 6 mois.\n\nPrincipes andragogiques : jeux de rôle managériaux (recrutement, feedback, conflit), introspection sur son style de leadership (autodiagnostic), cas culturellement ancrés au Maghreb, apprentissage par les pairs (co-développement professionnel).",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 9. Scaling & Internationalisation ───────────────────────────────────────
(
  'Scaling & Internationalisation',
  'entrepreneurship',
  'Passez de 1 à 10 pays : stratégies d''expansion en Afrique francophone, réglementations douanières, paiement mobile et partenariats stratégiques. Cas : Chari, DabaDoc.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur le scaling et l''internationalisation des startups nord-africaines.\n\nModule 1 — Quand et comment scaler : métriques de readiness (product-market fit confirmé, unit economics positifs, processus reproductibles), dangers du scaling prématuré. Cadre : le Blitzscaling de Reid Hoffman adapté aux réalités africaines. Cas réel : Chari — du Maroc à la Côte d''Ivoire, partenariat avec OCP. Activité : diagnostic de scaling readiness pour son propre projet.\n\nModule 2 — Expansion en Afrique francophone : choix des marchés (Sénégal, Côte d''Ivoire, Cameroun — critères de sélection), adaptation produit, recrutement local vs expatriation, partenaires locaux. Cas réel : DabaDoc — expansion de la prise de rendez-vous médicale au-delà du Maroc. Activité : élaborer une matrice de sélection de marché et choisir les 2 premiers pays d''expansion.\n\nModule 3 — Réglementations et logistique transfrontalière : zones de libre-échange (ZLECAf), accords bilatéraux Maroc-CEDEAO, réglementations douanières, transferts de fonds (problème majeur), devises et taux de change. Activité : cartographier les barrières réglementaires pour un cas d''expansion Maroc → Sénégal.\n\nModule 4 — Paiement et fintech en Afrique : mobile money (Orange Money, Wave, M-Pesa), paiement en ligne (CMI, Flouci, CIB), cash dominant, crypto émergente. Intégrer les bons prestataires de paiement par marché. Cas réel : comment les super-apps (Yassir, Chari) intègrent le paiement multi-pays. Activité : concevoir l''architecture de paiement pour un service opérant dans 3 pays.\n\nModule 5 — Partenariats stratégiques et M&A : corporate ventures, partenariats distributeurs, acquisitions. Négocier avec des grands groupes (OCP, Sonatrach, Tunisie Telecom). Cas réel : Chari acquis par un groupe international — analyse de l''opération. Activité : simuler une négociation de partenariat stratégique (startup vs corporate) avec rôles et brief confidentiel.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback. Niveau 2 — quiz internationalisation. Niveau 3 — livrable : plan d''internationalisation complet (2 marchés, timeline 18 mois, budget). Niveau 4 — première opération à l''international réalisée dans les 12 mois.\n\nPrincipes andragogiques : cas réels de scaling africain, simulation de décisions stratégiques complexes, travail en groupe sur des scénarios d''expansion, témoignages de fondateurs ayant internationalisé.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
),

-- ── 10. Résilience & Pivot ──────────────────────────────────────────────────
(
  'Résilience & Pivot',
  'entrepreneurship',
  'Gérez les crises, pivotez stratégiquement et prévenez le burn-out entrepreneurial. Témoignages d''échecs et de rebonds dans l''écosystème nord-africain, où la culture de l''échec évolue.',
  '{
    "requirement": "Concevoir un parcours andragogique (30 % théorie / 70 % pratique) sur la résilience entrepreneuriale et le pivot stratégique en Afrique du Nord.\n\nModule 1 — Anatomie de l''échec entrepreneurial : statistiques (90 % des startups échouent, mais en Afrique du Nord le sujet reste tabou), causes principales (marché, équipe, cash, timing), analyse post-mortem. Cas réels : startups maghrébines qui ont fermé — analyses factuelles et respectueuses. Activité : atelier d''analyse post-mortem — déconstruire un échec réel en groupe.\n\nModule 2 — Gestion de crise : identifier les signaux faibles, plan de crise (communication, trésorerie, clients, équipe), prise de décision sous pression. Spécificités : crises liées au contexte nord-africain (instabilité réglementaire, fluctuations de devises, crises politiques). Cas réel : startups ayant survécu à la crise COVID au Maghreb. Activité : simulation de crise en temps réel — scénario catastrophe avec décisions à prendre toutes les 5 minutes.\n\nModule 3 — Le pivot stratégique : reconnaître le moment du pivot, types de pivot (zoom-in, zoom-out, customer segment, channel, technology), méthodologie structurée. Cas réel : startups maghrébines ayant pivoté avec succès (exemples : passage du B2C au B2B, d''un marché local à l''export). Activité : atelier — à partir d''un scénario de startup en difficulté, proposer et argumenter un pivot en sous-groupes.\n\nModule 4 — Résilience personnelle et burn-out : prévalence du burn-out chez les entrepreneurs (70 % selon études), signaux d''alerte, stratégies de prévention, équilibre vie professionnelle/personnelle dans des cultures où l''entrepreneur est censé tout sacrifier. Spécificités : pression familiale et sociale au Maghreb, stigmate de l''échec. Activité : auto-diagnostic de résilience + élaboration d''un plan personnel de prévention du burn-out. Cercle de parole (format Balint adapté).\n\nModule 5 — Écosystème de soutien et rebond : incubateurs, accélérateurs, mentors, communautés (Startup Maroc, Tunisian Startups, Algeria Startup Challenge), réseaux de soutien psychologique. Construire sa communauté de pairs. Cas réel : témoignage d''un entrepreneur ayant rebondi après un échec — parcours complet. Activité : cartographier son écosystème de soutien personnel et identifier les 3 actions pour le renforcer.\n\nÉvaluation (Kirkpatrick) : Niveau 1 — feedback et bien-être ressenti. Niveau 2 — quiz gestion de crise et pivot. Niveau 3 — livrable : plan de contingence personnel (scénarios de crise + réponses) et plan de bien-être. Niveau 4 — l''entrepreneur a-t-il activé son réseau de soutien et maintenu son équilibre 6 mois après ?\n\nPrincipes andragogiques : espace de parole sécurisé (règles de confidentialité), témoignages authentiques, simulation de crise immersive, introspection guidée, déstigmatisation de l''échec dans le contexte culturel nord-africain, peer support.",
    "language": "fr-FR"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'fr-FR'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 2 — ARABE (ar-MA)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES

-- ── 1. من الفكرة إلى المشروع ────────────────────────────────────────────────
(
  'من الفكرة إلى المشروع',
  'entrepreneurship',
  'تعلّم كيف تتحقّق من جدوى فكرتك الريادية في السياق المغاربي والشمال أفريقي : دراسة السوق المحلّية، منهجية Lean Canvas والاختبار الميداني. حالات واقعية : Chari، Yassir، InstaDeep.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول التحقّق من الأفكار الريادية في المنظومة الشمال أفريقية.\n\nالوحدة 1 — تحديد مشكلة حقيقية : الملاحظة الميدانية، المقابلات الاستكشافية (منهجية Mom Test)، خريطة المشاكل المحلّية (النقل الحضري، الولوج للخدمات المالية، لوجستيك الميل الأخير في المغرب العربي). نشاط : محاكاة خروج ميداني بشبكة ملاحظة مهيكلة.\n\nالوحدة 2 — Lean Canvas وعرض القيمة : ملء Lean Canvas خطوة بخطوة. حالة واقعية : كيف حدّدت Chari (المغرب) مشكلة توزيع المواد الاستهلاكية في البقالات. نشاط : ورشة تعاونية — كل متعلّم يبني Lean Canvas الخاص به ويخضعه لمراجعة الأقران.\n\nالوحدة 3 — دراسة السوق المحلّية : مصادر البيانات (المندوبية السامية للتخطيط بالمغرب، المعهد الوطني للإحصاء بتونس، الديوان الوطني للإحصائيات بالجزائر)، تقدير TAM/SAM/SOM في أسواق محدودة البيانات. حالة واقعية : كيف قدّرت Yassir حجم سوق النقل في الجزائر. نشاط : تمرين تقدير حجم سوق لحالة مغاربية افتراضية.\n\nالوحدة 4 — النمذجة السريعة والاختبار : MVP ورقي، صفحة هبوط اختبارية، Concierge MVP. حالة واقعية : InstaDeep والتحقّق من عرض الذكاء الاصطناعي مع أوائل العملاء B2B في تونس. نشاط : بناء نموذج ورقي واختباره مع 5 أشخاص (محاكاة ثنائية).\n\nالوحدة 5 — قرار الانطلاق أو التوقّف : شبكة تسجيل متعدّدة المعايير، المحور أو المثابرة. ورشة محاكاة : لجنة قرار بأدوار (مؤسّس، مستثمر، عميل).\n\nالتقييم (وفق Kirkpatrick) : المستوى 1 — استبيان رضا. المستوى 2 — اختبار حول Lean Canvas ومنهجية Mom Test. المستوى 3 — تقديم Lean Canvas كامل لمشروع شخصي. المستوى 4 — متابعة بعد 3 أشهر : هل تمّ اختبار الفكرة ميدانياً ؟\n\nالمبادئ الأندراغوجية : التعلّم التجريبي (Kolb)، مشاكل حقيقية شمال أفريقية، التعلّم بالأقران بشكل منهجي، التأمّل ما وراء المعرفي في نهاية كل وحدة.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 2. نموذج الأعمال وعرض القيمة ───────────────────────────────────────────
(
  'نموذج الأعمال وعرض القيمة',
  'entrepreneurship',
  'أتقن Business Model Canvas وValue Proposition Design لبناء نموذج اقتصادي قابل للحياة في الأسواق المغاربية. دراسات حالة : Hmizate، Jumia المغرب، Expensya.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول بناء نماذج الأعمال الملائمة للأسواق الشمال أفريقية.\n\nالوحدة 1 — Business Model Canvas : المربّعات التسعة، الترابطات والقراءة الاستراتيجية. حالة واقعية : تفكيك نموذج أعمال Jumia المغرب (سوق إلكتروني، تحدّيات لوجستية، الدفع عند الاستلام المهيمن). نشاط : ملء BMC لشركة ناشئة افتراضية في التجارة الإلكترونية الغذائية بالدار البيضاء.\n\nالوحدة 2 — تصميم عرض القيمة : المهامّ المطلوب إنجازها (jobs-to-be-done)، الآلام والمكاسب، التوافق بين المنتج والسوق. حالة واقعية : كيف صمّمت Expensya (تونس) عرض قيمتها لإدارة مصاريف الشركات. نشاط : ورشة Value Proposition Canvas ثنائية مع تبادل ونقد بنّاء.\n\nالوحدة 3 — نماذج الإيرادات الملائمة للمغرب العربي : freemium، عمولة، اشتراك، الدفع حسب الاستخدام. خصوصيات : ضعف انتشار البطاقة البنكية، اقتصاد نقدي، الدفع عبر الهاتف الناشئ. حالة واقعية : Hmizate ونموذج العرض اليومي — النجاح الأوّلي ثم المحور. نشاط : محاكاة تسعير لثلاث شرائح عملاء مغاربية.\n\nالوحدة 4 — اختبار نموذج الأعمال وتكراره : الفرضيات الحاسمة، تجارب التحقّق، المؤشّرات الأساسية. حالة واقعية : كيف اختبرت Heetch ثم غيّرت نموذجها في المغرب بسبب التنظيم. نشاط : صياغة 5 فرضيات حاسمة وتصميم تجربة تحقّق لكل منها.\n\nالوحدة 5 — المحور الاستراتيجي : متى وكيف تغيّر اتجاهك. أنواع المحاور (zoom-in، شريحة العملاء، المنصّة). حالة واقعية : InstaDeep — من استشارات الذكاء الاصطناعي إلى منتج deeptech. ورشة : لعب أدوار — مجلس الإدارة يتحدّى المؤسّس حول محوره.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات فورية. المستوى 2 — اختبار BMC وVPC. المستوى 3 — مُخرج : BMC كامل ومُعلَّل لمشروع حقيقي. المستوى 4 — هل تمّت مواجهة النموذج مع عملاء حقيقيين خلال 3 أشهر ؟\n\nالمبادئ الأندراغوجية : حالات واقعية شمال أفريقية، التعلّم بالأقران (مراجعة منهجية)، مشروع متواصل فردي، تأمّل نقدي حول الخصوصيات الثقافية والاقتصادية للمغرب العربي.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 3. الإطار القانوني وتأسيس الشركة ───────────────────────────────────────
(
  'الإطار القانوني وتأسيس الشركة',
  'entrepreneurship',
  'تنقّل في إجراءات تأسيس الشركات بالمغرب وتونس والجزائر : الأشكال القانونية، الجبايات، قانون الشركات الناشئة والإجراءات الإدارية العملية.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول الإطار القانوني والإداري لتأسيس الشركات في شمال أفريقيا.\n\nالوحدة 1 — اختيار الشكل القانوني : SARL، SAS، SA، المقاول الذاتي (المغرب)، SUARL (تونس)، EURL/SARL (الجزائر). مقارنة الأنظمة : رأس المال الأدنى، المسؤولية، الحوكمة، الأعباء الاجتماعية. نشاط : اختبار تفاعلي — أي شكل قانوني لأي مشروع ؟ محاكاة الاختيار لـ 4 ملفّات شركات ناشئة.\n\nالوحدة 2 — إجراءات التأسيس بالمغرب : المركز الجهوي للاستثمار، السجل التجاري، الصندوق الوطني للضمان الاجتماعي، التسجيل الضريبي، الرسم المهني. التركيز : الشبّاك الوحيد والآجال الفعلية. نشاط : ملء ملف تأسيس SARL كامل (نماذج حقيقية مبسّطة).\n\nالوحدة 3 — الإجراءات في تونس والجزائر : وكالة النهوض بالصناعة والتجديد بتونس، قانون الشركات الناشئة التونسي (علامة startup، امتيازات جبائية، عطلة ريادة الأعمال، منحة)، السجل التجاري الجزائري، ANADE. نشاط : دراسة مقارنة — تأسيس نفس الشركة في تونس مقابل الجزائر مقابل الدار البيضاء.\n\nالوحدة 4 — الجبايات الخاصة بالشركات الناشئة : الضريبة على الشركات، الضريبة على الدخل، الضريبة على القيمة المضافة، الاشتراكات الاجتماعية. الآليات التحفيزية : قانون Startup Act تونس، Maroc PME، نظام CFC الدار البيضاء. نشاط : محاكاة جبائية — حساب أعباء السنة الأولى لثلاثة سيناريوهات.\n\nالوحدة 5 — الملكية الفكرية والعقود : العلامات التجارية (OMPIC، INNORPI، INAPI)، براءات الاختراع، عقود الشراكة، ميثاق المساهمين. حالة واقعية : نزاع بين مؤسّسين مشاركين — دراسة حالة. نشاط : صياغة الخطوط العريضة لميثاق مساهمين باستخدام نموذج.\n\nالتقييم (Kirkpatrick) : المستوى 1 — الرضا. المستوى 2 — اختبار حول الأشكال القانونية والجبايات. المستوى 3 — مُخرج : ملف تأسيس كامل لمشروع شخصي. المستوى 4 — هل تمّ تأسيس الشركة فعلياً خلال 6 أشهر ؟\n\nالمبادئ الأندراغوجية : مقارنات عبر وطنية مغاربية، وثائق حقيقية مبسّطة، التعلّم بالممارسة الإدارية، شهادات روّاد أعمال حول المزالق.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 4. المالية والمحاسبة لروّاد الأعمال ────────────────────────────────────
(
  'المالية والمحاسبة لروّاد الأعمال',
  'entrepreneurship',
  'أتقن الأساسيات المالية الضرورية : الخزينة، عتبة الربحية، قراءة القوائم المالية وإدارة احتياجات رأس المال العامل، مع خصوصيات القطاع البنكي المغاربي.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول المالية والمحاسبة لروّاد الأعمال غير المتخصّصين في شمال أفريقيا.\n\nالوحدة 1 — قراءة وفهم القوائم المالية : الميزانية، حساب النتائج، جدول تدفّقات الخزينة. تبسيط لغير المحاسبين. حالة واقعية : تحليل القوائم المالية المنشورة لشركة مغربية مدرجة. نشاط : تمرين قراءة تعليقية لميزانية حقيقية مبسّطة.\n\nالوحدة 2 — الخزينة والبقاء : مخطّط الخزينة التقديري، إدارة السيولة اليومية، آجال الدفع (إشكالية كبرى في المغرب العربي : 90-120 يوماً شائعة). حالة واقعية : شركة ناشئة مغربية في نموّ كادت تتوقّف عن الدفع رغم دفتر طلبات ممتلئ. نشاط : بناء مخطّط خزينة على 12 شهراً بفرضيات واقعية.\n\nالوحدة 3 — عتبة الربحية والتسعير : أعباء ثابتة مقابل متغيّرة، حساب نقطة التعادل، الهوامش. خصوصيات : أسواق ذات قدرة شرائية محدودة، ضغط على الأسعار، منافسة القطاع غير المهيكل. نشاط : محاكاة — إيجاد السعر العادل لخدمة SaaS B2B في المغرب العربي وحساب نقطة التعادل.\n\nالوحدة 4 — احتياجات رأس المال العامل وتمويل دورة الاستغلال : فهم BFR، تحسينه، التفاوض مع البنوك المغاربية (الضمانات المطلوبة، أسعار الفائدة، التمويل الإسلامي المرابحة). نشاط : لعب أدوار — مفاوضة بنكية (رائد أعمال مقابل بنكي) مع ملخّص سرّي لكل دور.\n\nالوحدة 5 — لوحات القيادة والمؤشّرات : بناء dashboard مالي للشركة الناشئة، مؤشّرات SaaS (MRR، churn، LTV/CAC)، مؤشّرات التجارة. نشاط : بناء لوحة قيادة شخصية على نموذج Excel/Sheets.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات. المستوى 2 — اختبار المفاهيم المالية. المستوى 3 — مُخرج : مخطّط خزينة 12 شهراً ولوحة قيادة لمشروعه. المستوى 4 — هل يستخدم رائد الأعمال لوحة قيادته فعلياً بعد 3 أشهر ؟\n\nالمبادئ الأندراغوجية : تبسيط (بدون مصطلحات غير ضرورية)، حالات مغاربية ملموسة، لعب أدوار (مفاوضة بنكية)، أدوات قابلة لإعادة الاستخدام فوراً.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 5. التسويق الرقمي واختراق النموّ ────────────────────────────────────────
(
  'التسويق الرقمي واختراق النموّ',
  'entrepreneurship',
  'انشر استراتيجية تسويق رقمي فعّالة في المغرب العربي : SEO/SEA، فيسبوك وواتساب بيزنس، التسويق عبر المؤثّرين المحلّيين وGrowth Hacking بميزانية محدودة.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول التسويق الرقمي واختراق النموّ في شمال أفريقيا.\n\nالوحدة 1 — المنظومة الرقمية الشمال أفريقية : نسبة انتشار الإنترنت والهاتف، المنصّات المهيمنة (فيسبوك رقم 1 بفارق كبير، إنستغرام في نموّ، تيك توك ينفجر عند الشباب)، سلوكيات الشراء عبر الإنترنت، العوائق (الثقة، الدفع، التوصيل). نشاط : تدقيق رقمي لمنافس محلّي باستخدام أدوات مجّانية.\n\nالوحدة 2 — تحسين محرّكات البحث والتسويق بالمحتوى للمغرب العربي : SEO بالفرنسية والعربية (بما في ذلك الدارجة)، Google My Business للتجارة المحلّية. حالة واقعية : كيف بنت DabaDoc حركتها العضوية بالمغرب عبر المحتوى الصحّي. نشاط : تحديد استراتيجية كلمات مفتاحية ثنائية اللغة لمشروع.\n\nالوحدة 3 — الإعلان الرقمي : Facebook Ads (استهداف المغرب العربي، ميزانيات واقعية : 5-20 دولار/يوم)، Google Ads، Instagram Ads. حالة واقعية : Glovo المغرب — استراتيجية اكتساب متعدّدة القنوات. نشاط : إنشاء وتخطيط ميزانية حملة Facebook Ads كاملة لإطلاق بالمغرب.\n\nالوحدة 4 — واتساب بيزنس والتسويق المحادثاتي : واتساب كقناة رئيسية للعلاقة مع العملاء في شمال أفريقيا، كتالوجات المنتجات، الرسائل الآلية، WhatsApp Business API. حالة واقعية : كيف تستخدم Yassir واتساب للدعم والولاء. نشاط : إعداد حساب واتساب بيزنس وإنشاء سيناريو محادثة عملاء كامل.\n\nالوحدة 5 — اختراق النموّ بميزانية محدودة : حلقات فيروسية، برامج إحالة، الشراكات المتبادلة، التسويق عبر المؤثّرين المحلّيين (ميكرو-مؤثّرون مغاربيون). نشاط : تصميم 3 تجارب نموّ لمشروع وترتيبها بإطار ICE.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات. المستوى 2 — اختبار تسويق رقمي. المستوى 3 — مُخرج : خطّة تسويق رقمي 90 يوماً بميزانية. المستوى 4 — مؤشّرات اكتساب فعلية بعد 3 أشهر.\n\nالمبادئ الأندراغوجية : أدوات مجّانية ومتاحة، حالات شمال أفريقية حصرياً، التعلّم بالممارسة (كل وحدة = مُخرج ملموس)، مراجعة الأقران للاستراتيجيات.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 6. البيع والتفاوض التجاري ──────────────────────────────────────────────
(
  'البيع والتفاوض التجاري',
  'entrepreneurship',
  'طوّر مهاراتك في البيع والتفاوض التجاري بما يتلاءم مع السياق العلائقي الشمال أفريقي : تقنيات B2B وB2C، تسعير الأسواق الناشئة والتفاوض بين الثقافات.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول البيع والتفاوض التجاري في السياق الشمال أفريقي.\n\nالوحدة 1 — فهم المشتري الشمال أفريقي : سيكولوجية الشراء، أهمّية علاقة الثقة، دور الشبكة الشخصية (المعريفة)، دورة القرار الطويلة في B2B، الحساسية تجاه السعر. نشاط : رسم مسار الشراء النموذجي لمنتج B2B ومنتج B2C في المغرب العربي.\n\nالوحدة 2 — تقنيات البيع B2B المكيّفة : التنقيب (LinkedIn، فعاليات، شبكة)، الموعد التجاري المهيكل (SPIN Selling مكيّف)، إدارة الاعتراضات الشائعة في المغرب العربي (« غالي بزّاف »، « خدّامين مع شي واحد آخر »، « عاودوا لنا الشهر الجاي »). حالة واقعية : كيف حصلت شركة SaaS مغربية ناشئة على أوّل 10 عملاء B2B. نشاط : لعب أدوار — موعد بيع B2B (بائع، مشتري، مراقب) مع تحليل مهيكل.\n\nالوحدة 3 — تقنيات البيع B2C والتجزئة : البيع في المتجر، البيع عبر الإنترنت، البيع الإضافي والبيع المتقاطع. خصوصيات : الدفع عند الاستلام المهيمن، المرتجعات المتكرّرة، أهمّية تقييمات واتساب. نشاط : محاكاة بيع كامل عبر الإنترنت (من الإعلان إلى متابعة ما بعد التوصيل).\n\nالوحدة 4 — التفاوض التجاري بين الثقافات : أساليب التفاوض في المغرب العربي (علائقية، غير خطّية، أهمّية الشاي والوقت)، التفاوض مع شركاء أوروبيين وخليجيين، إدارة التنازلات. إطار : منهجية هارفارد مكيّفة للسياق الثقافي. نشاط : محاكاة تفاوض ثلاثية (مورّد مغربي، عميل فرنسي، مستثمر إماراتي) مع مراقبين.\n\nالوحدة 5 — التسعير والاستراتيجية التجارية : تحديد الأسعار في سوق ذات قدرة شرائية محدودة، تجنّب حرب الأسعار، بناء القيمة المُدركة. حالة واقعية : استراتيجيات تسعير Yassir مقابل Careem في المغرب العربي. نشاط : بناء شبكة تعريفية لثلاث شرائح والدفاع عنها أمام المجموعة.\n\nالتقييم (Kirkpatrick) : المستوى 1 — الرضا والتقييم الذاتي. المستوى 2 — اختبار التفاوض والبيع. المستوى 3 — مُخرج : سيناريو بيع B2B أو B2C كامل لمشروعه. المستوى 4 — عدد المبيعات المحقّقة في الأشهر الـ 3 التالية.\n\nالمبادئ الأندراغوجية : لعب أدوار مكثّف (60% من الوقت)، حالات ثقافياً مُرسّخة، تحليل جماعي بعد كل محاكاة، التعلّم من الخطأ في إطار داعم.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 7. جمع التمويل والتمويل ────────────────────────────────────────────────
(
  'جمع التمويل والتمويل',
  'entrepreneurship',
  'استكشف جميع خيارات التمويل المتاحة في شمال أفريقيا : bootstrap، مستثمرون ملائكيون، صناديق رأس المال المخاطر، الدعم العمومي (إنطلاقة، فُرصة، Startup Act) والتمويل التشاركي.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول التمويل وجمع الأموال للشركات الناشئة في شمال أفريقيا.\n\nالوحدة 1 — بانوراما التمويل في شمال أفريقيا : bootstrap، أموال الأقارب، القروض البنكية، الصناديق العمومية، المستثمرون الملائكيون، رأس المال المخاطر، التمويل التشاركي. خريطة المنظومة : Maroc Numeric Fund، 212 Founders، Azur Innovation Fund (المغرب)، Flat6Labs (تونس/مصر)، Algeria Venture، Cairo Angels. نشاط : اختبار تفاعلي — أي تمويل لأي مرحلة ؟ رسم خريطة الخيارات لمشروعه.\n\nالوحدة 2 — الدعم العمومي والآليات الحكومية : برنامج إنطلاقة وفُرصة (المغرب)، قانون Startup Act التونسي (8 سنوات إعفاء ضريبي، منحة، عطلة ريادة الأعمال)، ANADE (الجزائر)، TIEC (مصر). مقارنة الآليات حسب البلد. حالة واقعية : مسار رائد أعمال تونسي حاصل على علامة Startup Act. نشاط : ملء ملف طلب إنطلاقة أو Startup Act (محاكاة بوثائق حقيقية مبسّطة).\n\nالوحدة 3 — إعداد عرض المستثمرين (Pitch Deck) : هيكل العرض (المشكلة، الحل، السوق، الجذب، الفريق، الطلب)، السرد القصصي المكيّف لمستثمري المنطقة. حالة واقعية : تحليل عرض Chari قبل الجولة A. نشاط : بناء pitch deck (10 شرائح كحدّ أقصى) وتقديمه للمجموعة — ملاحظات مهيكلة من الأقران.\n\nالوحدة 4 — التفاوض مع المستثمرين : term sheet، التقييم pre/post-money، التخفيف، البنود (liquidation preference، anti-dilution، مقاعد مجلس الإدارة)، العناية الواجبة. خصوصيات إقليمية : مستثمرون يتجنّبون المخاطر، أهمّية السجل والشبكة. نشاط : لعب أدوار — محاكاة تفاوض term sheet (مؤسّس مقابل VC) مع تحليل.\n\nالوحدة 5 — البدائل : التمويل التشاركي والتمويل الإسلامي : منصّات نشطة (Cotizi المغرب، Afrikwity، Zoomaal)، equity crowdfunding، التمويل الإسلامي (مضاربة، مشاركة)، الجمعيات الادّخارية الرقمية. نشاط : تصميم حملة تمويل تشاركي كاملة.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات. المستوى 2 — اختبار التمويل وterm sheet. المستوى 3 — مُخرج : pitch deck كامل + خطّة تمويل على 18 شهراً. المستوى 4 — تمويل فعلي تمّ جمعه أو دعم تمّ الحصول عليه خلال 6 أشهر.\n\nالمبادئ الأندراغوجية : خريطة شخصية للخيارات، محاكاة عرض مكثّفة، وثائق حقيقية، التعلّم بالأقران، شهادات مستثمرين محلّيين.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 8. إدارة الفريق والقيادة ──────────────────────────────────────────────
(
  'إدارة الفريق والقيادة',
  'entrepreneurship',
  'وظّف وحفّز وقُد فريق شركة ناشئة في السياق الثقافي المغاربي : التوظيف، ثقافة المؤسّسة، الإدارة عن بُعد والقيادة الظرفية.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول إدارة الفريق والقيادة في سياق الشركات الناشئة الشمال أفريقية.\n\nالوحدة 1 — التوظيف في الشركة الناشئة : استقطاب الكفاءات في منظومة تهيمن فيها الشركات الكبرى والوظيفة العمومية، قنوات التوظيف (LinkedIn، ReKrute، Emploi.tn، Bayt)، المقابلات المهيكلة. خصوصيات : هجرة الأدمغة، منافسة الرواتب الأوروبية للمطوّرين. حالة واقعية : كيف هيكلت Chari توظيفها أثناء النموّ الفائق. نشاط : صياغة بطاقة وظيفة جاذبة لأوّل توظيف ومحاكاة مقابلة.\n\nالوحدة 2 — ثقافة المؤسّسة والقيم : تحديد القيم وتجسيدها، الإدماج، طقوس الفريق. خصوصيات ثقافية : التراتبية الضمنية، العلاقة بالسلطة، التواصل غير المباشر، احترام الأكبر سنّاً. حالة واقعية : ثقافة المؤسّسة في Yassir — التوفيق بين النموّ السريع والهوية الجزائرية. نشاط : ورشة تعاونية — تحديد ميثاق ثقافة شركته الناشئة.\n\nالوحدة 3 — القيادة الظرفية : نموذج Hersey-Blanchard المكيّف، متى تُوجّه، تُدرّب، تدعم أو تُفوّض. إدارة النزاعات في سياق ثقافي يصعب فيه المواجهة المباشرة. نشاط : دراسات حالة ظرفية — أي موقف قيادي لكل سيناريو ؟ لعب أدوار مع ملاحظات 360°.\n\nالوحدة 4 — الإدارة عن بُعد والفِرق الموزّعة : الأدوات (Slack، Notion، Linear)، الطقوس اللامتزامنة، إدارة الوقت والإنتاجية. تحدّيات خاصّة : تقلّب جودة الإنترنت، ثقافة الحضور الجسدي، الحدود بين الحياة المهنية والشخصية. نشاط : تصميم نظام إدارة عن بُعد كامل لفريق من 5 أشخاص.\n\nالوحدة 5 — الاحتفاظ بالكفاءات وتطويرها : مسارات مهنية في الشركة الناشئة، حصص الأسهم (الإطار القانوني المحدود في المغرب العربي)، التكوين المستمر، إدارة فقدان الحافز. نشاط : بناء خطّة احتفاظ بمطوّر أقدم يُغريه عرض في أوروبا.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات. المستوى 2 — اختبار القيادة والإدارة. المستوى 3 — مُخرج : ميثاق ثقافة + خطّة توظيف للأشهر الـ 6 القادمة. المستوى 4 — معدّل الدوران ورضا الفريق بعد 6 أشهر.\n\nالمبادئ الأندراغوجية : لعب أدوار إدارية (توظيف، ملاحظات، نزاع)، استبطان حول أسلوب القيادة الشخصي، حالات ثقافياً مُرسّخة في المغرب العربي، التعلّم بالأقران (التطوير المهني المشترك).",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 9. التوسّع والتدويل ────────────────────────────────────────────────────
(
  'التوسّع والتدويل',
  'entrepreneurship',
  'انتقل من بلد واحد إلى 10 بلدان : استراتيجيات التوسّع في أفريقيا الفرنكوفونية، اللوائح الجمركية، الدفع عبر الهاتف والشراكات الاستراتيجية. حالات : Chari، DabaDoc.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول التوسّع والتدويل للشركات الناشئة الشمال أفريقية.\n\nالوحدة 1 — متى وكيف تتوسّع : مؤشّرات الجاهزية (product-market fit مؤكّد، unit economics إيجابية، عمليات قابلة للتكرار)، مخاطر التوسّع المبكر. إطار : Blitzscaling لـ Reid Hoffman مكيّف للواقع الأفريقي. حالة واقعية : Chari — من المغرب إلى كوت ديفوار، شراكة مع OCP. نشاط : تشخيص جاهزية التوسّع لمشروعه.\n\nالوحدة 2 — التوسّع في أفريقيا الفرنكوفونية : اختيار الأسواق (السنغال، كوت ديفوار، الكاميرون — معايير الاختيار)، تكييف المنتج، التوظيف المحلّي مقابل الإرسال، الشركاء المحلّيون. حالة واقعية : DabaDoc — توسيع حجز المواعيد الطبّية خارج المغرب. نشاط : إعداد مصفوفة اختيار السوق وتحديد أوّل بلدين للتوسّع.\n\nالوحدة 3 — اللوائح واللوجستيك العابر للحدود : مناطق التجارة الحرّة (ZLECAf)، الاتفاقيات الثنائية المغرب-CEDEAO، اللوائح الجمركية، تحويلات الأموال (إشكالية كبرى)، العملات وأسعار الصرف. نشاط : رسم خريطة العوائق التنظيمية لحالة توسّع المغرب → السنغال.\n\nالوحدة 4 — الدفع والتكنولوجيا المالية في أفريقيا : الدفع عبر الهاتف (Orange Money، Wave، M-Pesa)، الدفع عبر الإنترنت (CMI، Flouci، CIB)، النقد المهيمن، العملات المشفّرة الناشئة. حالة واقعية : كيف تدمج التطبيقات الشاملة (Yassir، Chari) الدفع متعدّد البلدان. نشاط : تصميم بنية الدفع لخدمة تعمل في 3 بلدان.\n\nالوحدة 5 — الشراكات الاستراتيجية والاستحواذ : corporate ventures، شراكات التوزيع، الاستحواذات. التفاوض مع المجموعات الكبرى (OCP، سوناطراك، اتصالات تونس). حالة واقعية : استحواذ مجموعة دولية على Chari — تحليل العملية. نشاط : محاكاة تفاوض شراكة استراتيجية (startup مقابل corporate) بأدوار وملخّصات سرّية.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات. المستوى 2 — اختبار التدويل. المستوى 3 — مُخرج : خطّة تدويل كاملة (سوقان، جدول زمني 18 شهراً، ميزانية). المستوى 4 — أوّل عملية دولية مُنجزة خلال 12 شهراً.\n\nالمبادئ الأندراغوجية : حالات واقعية للتوسّع الأفريقي، محاكاة قرارات استراتيجية معقّدة، عمل جماعي على سيناريوهات التوسّع، شهادات مؤسّسين دوّلوا شركاتهم.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
),

-- ── 10. الصمود والمحور الاستراتيجي ─────────────────────────────────────────
(
  'الصمود والمحور الاستراتيجي',
  'entrepreneurship',
  'تعامل مع الأزمات، قم بالمحور الاستراتيجي واحمِ نفسك من الاحتراق المهني. شهادات إخفاق ونهوض في منظومة شمال أفريقيا حيث تتطوّر ثقافة تقبّل الفشل.',
  '{
    "requirement": "تصميم مسار تعليمي أندراغوجي (30% نظري / 70% تطبيقي) حول الصمود الريادي والمحور الاستراتيجي في شمال أفريقيا.\n\nالوحدة 1 — تشريح الإخفاق الريادي : إحصائيات (90% من الشركات الناشئة تفشل، لكن الموضوع يظلّ من المحرّمات في شمال أفريقيا)، الأسباب الرئيسية (السوق، الفريق، السيولة، التوقيت)، التحليل بعد الوفاة. حالات واقعية : شركات ناشئة مغاربية أُغلقت — تحليلات واقعية ومحترمة. نشاط : ورشة تحليل بعد الوفاة — تفكيك إخفاق حقيقي جماعياً.\n\nالوحدة 2 — إدارة الأزمات : تحديد الإشارات الضعيفة، خطّة الأزمة (التواصل، الخزينة، العملاء، الفريق)، اتخاذ القرار تحت الضغط. خصوصيات : أزمات مرتبطة بالسياق الشمال أفريقي (عدم استقرار تنظيمي، تقلّبات العملات، أزمات سياسية). حالة واقعية : شركات ناشئة نجت من أزمة كوفيد في المغرب العربي. نشاط : محاكاة أزمة في الوقت الحقيقي — سيناريو كارثي مع قرارات كل 5 دقائق.\n\nالوحدة 3 — المحور الاستراتيجي : التعرّف على لحظة المحور، أنواع المحاور (zoom-in، zoom-out، شريحة العملاء، القناة، التكنولوجيا)، منهجية مهيكلة. حالات واقعية : شركات مغاربية ناشئة نجحت في محورها (أمثلة : الانتقال من B2C إلى B2B، من سوق محلّي إلى التصدير). نشاط : انطلاقاً من سيناريو شركة ناشئة في صعوبة، اقتراح محور وتبريره في مجموعات فرعية.\n\nالوحدة 4 — الصمود الشخصي والاحتراق المهني : انتشار الاحتراق عند روّاد الأعمال (70% وفق الدراسات)، إشارات الإنذار، استراتيجيات الوقاية، التوازن بين الحياة المهنية والشخصية في ثقافات يُفترض فيها أن يضحّي رائد الأعمال بكل شيء. خصوصيات : الضغط العائلي والاجتماعي، وصمة الفشل. نشاط : تشخيص ذاتي للصمود + إعداد خطّة شخصية للوقاية من الاحتراق. حلقة كلام (صيغة Balint مكيّفة).\n\nالوحدة 5 — منظومة الدعم والنهوض : الحاضنات، المسرّعات، المرشدون، المجتمعات (Startup Maroc، Tunisian Startups، Algeria Startup Challenge)، شبكات الدعم النفسي. بناء مجتمع أقران. حالة واقعية : شهادة رائد أعمال نهض بعد إخفاق — المسار الكامل. نشاط : رسم خريطة منظومة الدعم الشخصية وتحديد 3 إجراءات لتعزيزها.\n\nالتقييم (Kirkpatrick) : المستوى 1 — ملاحظات وحالة نفسية. المستوى 2 — اختبار إدارة الأزمات والمحور. المستوى 3 — مُخرج : خطّة طوارئ شخصية (سيناريوهات أزمات + استجابات) وخطّة رفاهية. المستوى 4 — هل فعّل رائد الأعمال شبكة دعمه وحافظ على توازنه بعد 6 أشهر ؟\n\nالمبادئ الأندراغوجية : فضاء كلام آمن (قواعد سرّية)، شهادات حقيقية، محاكاة أزمات غامرة، استبطان موجّه، إزالة وصمة الفشل في السياق الثقافي الشمال أفريقي، دعم الأقران.",
    "language": "ar-MA"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'ar-MA'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOC 3 — ENGLISH (en-US)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.classroom_templates (name, sector, description, requirements, skill_ids, language)
VALUES

-- ── 1. From Idea to Project ─────────────────────────────────────────────────
(
  'From Idea to Project',
  'entrepreneurship',
  'Learn to validate a startup idea within the North African ecosystem: local market research, lean canvas methodology, and field testing. Real cases from Morocco, Tunisia, and Algeria.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on startup idea validation in the North African ecosystem.\n\nModule 1 — Identifying a real problem: field observation, exploratory interviews (Mom Test methodology), mapping local pain points (urban mobility, financial access, last-mile logistics in the Maghreb). Activity: simulated field trip with structured observation grid.\n\nModule 2 — Lean Canvas and value proposition: step-by-step Lean Canvas completion. Real case: how Chari (Morocco) identified the FMCG distribution problem in neighbourhood grocery stores. Activity: collaborative workshop — each learner builds their Lean Canvas and submits it for cross peer review.\n\nModule 3 — Local market research: North African data sources (HCP Morocco, INS Tunisia, ONS Algeria), estimating TAM/SAM/SOM in data-scarce markets. Real case: how Yassir sized the ride-hailing market in Algeria before launch. Activity: market sizing exercise on a fictional Maghreb case.\n\nModule 4 — Rapid prototyping and testing: paper MVP, landing page test, concierge MVP. Real case: InstaDeep validating their AI offering with early B2B clients in Tunisia. Activity: build a paper prototype and test it with 5 people (paired simulation).\n\nModule 5 — Go / No-Go decision: multi-criteria scoring grid, pivot or persevere. Workshop simulation: decision committee with roles (founder, investor, customer).\n\nAssessment (Kirkpatrick-aligned): Level 1 — satisfaction survey. Level 2 — quiz on Lean Canvas and Mom Test. Level 3 — submission of a complete Lean Canvas for a personal project. Level 4 — 3-month follow-up: has the idea been field-tested?\n\nAndragogical principles: experiential learning (Kolb), authentic North African problems, systematic peer learning, metacognitive reflection at end of each module.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 2. Business Model & Value Proposition ───────────────────────────────────
(
  'Business Model & Value Proposition',
  'entrepreneurship',
  'Master the Business Model Canvas and Value Proposition Design to build a viable economic model in North African markets. Case studies: Hmizate, Jumia Morocco, Expensya.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on building business models suited to North African markets.\n\nModule 1 — Business Model Canvas (BMC): the 9 building blocks, interdependencies, and strategic reading. Real case: deconstructing Jumia Morocco''s BMC (e-commerce marketplace, logistics challenges, cash-on-delivery dominance). Activity: fill in a BMC for a fictional food e-commerce startup in Casablanca.\n\nModule 2 — Value Proposition Design: jobs-to-be-done, pains, gains, and product-market fit. Real case: how Expensya (Tunisia) designed its value proposition for corporate expense management. Activity: paired Value Proposition Canvas workshop with exchange and constructive critique.\n\nModule 3 — Revenue models for the Maghreb: freemium, commission, subscription, pay-per-use. Specificities: low card penetration, cash economy, emerging mobile money. Real case: Hmizate and the deal-of-the-day model in Morocco — initial success and pivot. Activity: pricing simulation for three Maghreb customer segments.\n\nModule 4 — Testing and iterating your business model: critical hypotheses, validation experiments, key metrics. Tools: Strategyzer Test Card. Real case: how Heetch tested then pivoted its model in Morocco due to VTC regulation. Activity: draft 5 critical hypotheses and design a validation experiment for each.\n\nModule 5 — Strategic pivot: when and how to pivot. Types (zoom-in, customer segment, platform). Real case: InstaDeep — from AI consulting to deeptech product. Workshop: role play — the board challenges the founder on the pivot decision.\n\nAssessment (Kirkpatrick-aligned): Level 1 — immediate feedback. Level 2 — BMC and VPC quiz. Level 3 — deliverable: complete, justified BMC for a real project. Level 4 — has the model been confronted with real customers within 3 months?\n\nAndragogical principles: authentic North African cases, systematic peer review, individual thread project throughout the course, critical reflection on Maghreb cultural and economic specificities.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 3. Legal Framework & Company Creation ───────────────────────────────────
(
  'Legal Framework & Company Creation',
  'entrepreneurship',
  'Navigate company creation procedures in Morocco, Tunisia, and Algeria: legal structures, startup taxation, Startup Act legislation, and hands-on administrative processes.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on the legal and administrative framework for company creation in North Africa.\n\nModule 1 — Choosing your legal structure: SARL, SAS, SA, auto-entrepreneur (Morocco), SUARL (Tunisia), EURL/SARL (Algeria). Regime comparison: minimum capital, liability, governance, social charges. Activity: interactive quiz — which structure for which project? Simulation for 4 startup profiles.\n\nModule 2 — Creation procedures in Morocco: CRI (Regional Investment Centre), trade register, CNSS social security, tax registration, business tax. Focus: the one-stop-shop and real-world timelines. Activity: complete a full SARL creation file (simplified real forms).\n\nModule 3 — Procedures in Tunisia and Algeria: API Tunisia, Tunisian Startup Act (startup label, tax advantages, entrepreneurship leave, grant), CNRC Algeria, ANADE. Activity: comparative study — creating the same startup in Tunis vs Algiers vs Casablanca (costs, timelines, benefits).\n\nModule 4 — Startup taxation: corporate tax, income tax, VAT, social contributions. Incentive schemes: Startup Act Tunisia, Maroc PME, CFC Casablanca Finance City regime, lump-sum regime. Real case: how a Tunisian fintech benefited from the Startup Act label. Activity: fiscal simulation — calculate first-year charges for three scenarios.\n\nModule 5 — Intellectual property and contracts: trademarks (OMPIC, INNORPI, INAPI), patents, partnership agreements, shareholders'' agreement. Real case: co-founder dispute — case study and lessons. Activity: draft the key clauses of a shareholders'' agreement using a template.\n\nAssessment (Kirkpatrick-aligned): Level 1 — satisfaction. Level 2 — quiz on legal structures and taxation. Level 3 — deliverable: complete creation file for a personal project (chosen and justified structure, fiscal simulation). Level 4 — was the company actually created within 6 months?\n\nAndragogical principles: cross-country Maghreb comparisons, simplified real documents, learning by administrative practice, entrepreneur testimonials on pitfalls to avoid.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 4. Finance & Accounting for Entrepreneurs ──────────────────────────────
(
  'Finance & Accounting for Entrepreneurs',
  'entrepreneurship',
  'Master the financial fundamentals every founder needs: cash flow management, break-even analysis, reading financial statements, and working capital, with Maghreb banking specificities.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on finance and accounting for non-financial entrepreneurs in North Africa.\n\nModule 1 — Reading financial statements: balance sheet, income statement, cash flow statement. Demystification for non-accountants. Real case: analysing published financial statements of a listed Moroccan company. Activity: guided reading of a simplified real balance sheet.\n\nModule 2 — Cash flow and survival: cash flow forecast, daily cash management, payment delays (a major Maghreb issue: 90-120 days is standard). Real case: a growing Moroccan startup that nearly went bankrupt despite a full order book. Activity: build a 12-month cash flow plan with realistic assumptions.\n\nModule 3 — Break-even and pricing: fixed vs variable costs, calculating the break-even point, margins. Specificities: markets with limited purchasing power, price pressure, competition from the informal economy. Activity: simulation — find the right price for a B2B SaaS in the Maghreb and calculate the break-even point.\n\nModule 4 — Working capital and financing the operating cycle: understanding working capital requirements, optimising them, negotiating with Maghreb banks (required guarantees, interest rates, Murabaha Islamic finance). Activity: role play — bank negotiation (entrepreneur vs banker) with confidential briefs for each role.\n\nModule 5 — Dashboards and KPIs: building a startup financial dashboard, SaaS metrics (MRR, churn, LTV/CAC), commerce metrics (average basket, stock turnover). Activity: build your own dashboard on an Excel/Sheets template.\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback. Level 2 — financial concepts quiz. Level 3 — deliverable: 12-month cash flow plan and dashboard for own project. Level 4 — is the entrepreneur actively using their dashboard 3 months later?\n\nAndragogical principles: demystification (no unnecessary jargon), concrete Maghreb cases, role plays (bank negotiation), immediately reusable tools (templates), peer feedback on deliverables.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 5. Digital Marketing & Growth Hacking ───────────────────────────────────
(
  'Digital Marketing & Growth Hacking',
  'entrepreneurship',
  'Deploy an effective digital marketing strategy in the Maghreb: SEO/SEA, Facebook and WhatsApp Business dominance, local influencer marketing, and low-budget growth hacking.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on digital marketing and growth hacking tailored to North Africa.\n\nModule 1 — The North African digital landscape: internet and mobile penetration, dominant platforms (Facebook overwhelmingly #1, Instagram growing, TikTok explosive among youth, Twitter/X minimal), online buying behaviours, barriers (trust, payment, delivery). Activity: digital audit of a local competitor using free tools.\n\nModule 2 — SEO and content marketing for the Maghreb: SEO in French and Arabic (including Darija dialect), Google My Business for local commerce, adapted blogging and content marketing. Real case: how DabaDoc built organic traffic in Morocco through health content. Activity: define a bilingual (FR/AR) keyword strategy for a project.\n\nModule 3 — Digital advertising (SEA and Social Ads): Facebook Ads (Maghreb targeting, realistic budgets: $5-20/day), Google Ads, Instagram Ads. Specificities: low CPA but difficult conversion, remarketing importance. Real case: Glovo Morocco — multi-channel acquisition strategy. Activity: create and budget a complete Facebook Ads campaign for a Morocco launch.\n\nModule 4 — WhatsApp Business and conversational marketing: WhatsApp as the primary customer relationship channel in North Africa, product catalogues, automated messages, WhatsApp Business API. Real case: how Yassir uses WhatsApp for support and retention. Activity: set up a WhatsApp Business account and create a complete customer conversation scenario.\n\nModule 5 — Low-budget growth hacking: viral loops, referral programs, ethical scraping, cross-partnerships, local influencer marketing (Maghreb micro-influencers). Real case: how Moroccan startups reached 10,000 users with zero ad budget. Activity: design 3 growth experiments for a project, prioritise with the ICE framework.\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback. Level 2 — digital marketing quiz. Level 3 — deliverable: 90-day digital marketing plan with budget. Level 4 — actual acquisition metrics after 3 months of implementation.\n\nAndragogical principles: free and accessible tools, exclusively North African cases, learning by doing (each module = a concrete deliverable), peer review of strategies.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 6. Sales & Business Negotiation ─────────────────────────────────────────
(
  'Sales & Business Negotiation',
  'entrepreneurship',
  'Build sales and negotiation skills adapted to the relationship-driven North African context: B2B and B2C techniques, pricing for emerging markets, and intercultural negotiation.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on sales and business negotiation in the North African context.\n\nModule 1 — Understanding the North African buyer: purchase psychology, the centrality of trust (thiqua), the role of personal networks (ma3rifa), long B2B decision cycles, price sensitivity. Activity: map the typical purchase journey for a B2B and a B2C product in the Maghreb.\n\nModule 2 — Adapted B2B sales techniques: prospecting (LinkedIn, events, network), structured sales meetings (SPIN Selling adapted), handling common Maghreb objections (\"too expensive\", \"we already work with someone\", \"come back next month\"). Real case: how a Moroccan SaaS startup landed its first 10 B2B clients. Activity: role play — B2B sales meeting (seller, buyer, observer) with structured debrief.\n\nModule 3 — B2C and retail sales techniques: in-store sales, online sales, upselling and cross-selling. Specificities: dominant cash-on-delivery, frequent returns, importance of WhatsApp reviews. Activity: simulate a complete online sale (from ad to post-delivery follow-up).\n\nModule 4 — Intercultural business negotiation: Maghreb negotiation styles (relationship-driven, non-linear, importance of tea and time), negotiating with European and Gulf partners, managing concessions. Framework: Harvard method adapted to the cultural context. Activity: trilateral negotiation simulation (Moroccan supplier, French client, Emirati investor) with observers.\n\nModule 5 — Pricing and sales strategy: setting prices in a market with limited purchasing power, avoiding price wars, building perceived value, freemium and premium offers. Real case: Yassir vs Careem pricing strategies in the Maghreb. Activity: build a pricing grid for three segments and defend it before the group.\n\nAssessment (Kirkpatrick-aligned): Level 1 — satisfaction and self-assessment. Level 2 — negotiation and sales quiz. Level 3 — deliverable: complete B2B or B2C sales script for own project. Level 4 — number of sales closed in the following 3 months.\n\nAndragogical principles: intensive role plays (60% of time), culturally situated cases, collective debrief after each simulation, learning through error in a supportive environment.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 7. Fundraising & Financing ──────────────────────────────────────────────
(
  'Fundraising & Financing',
  'entrepreneurship',
  'Explore every financing option available in North Africa: bootstrapping, angel investors, VC funds, public schemes (Intelaka, Forsa, Startup Act), and crowdfunding.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on fundraising and financing for startups in North Africa.\n\nModule 1 — Financing landscape in North Africa: bootstrapping, love money, bank loans, public funds, angel investors, VC, crowdfunding. Ecosystem map: Maroc Numeric Fund, 212 Founders, Azur Innovation Fund (Morocco), Flat6Labs (Tunisia/Egypt), Algeria Venture, Cairo Angels. Activity: interactive quiz — which financing for which stage? Map the options for your own project.\n\nModule 2 — Public support and government schemes: Intelaka and Forsa programmes (Morocco), Tunisian Startup Act (8-year tax exemption, grant, entrepreneurship leave), ANADE (Algeria), TIEC (Egypt). Cross-country scheme comparison. Real case: journey of a Tunisian entrepreneur with the Startup Act label. Activity: complete an Intelaka or Startup Act application (simulation with simplified real documents).\n\nModule 3 — Preparing your pitch deck: deck structure (problem, solution, market, traction, team, ask), storytelling adapted to regional investors. Real case: analysis of Chari''s pitch deck before its Series A. Activity: build your pitch deck (10 slides max) and present to the group — structured peer feedback.\n\nModule 4 — Negotiating with investors: term sheet, pre/post-money valuation, dilution, clauses (liquidation preference, anti-dilution, board seats), due diligence. Regional specificities: risk-averse investors, importance of track record and network. Activity: role play — term sheet negotiation simulation (founder vs VC) with debrief.\n\nModule 5 — Alternatives: crowdfunding and Islamic finance: active platforms (Cotizi Morocco, Afrikwity, Zoomaal), equity crowdfunding, Islamic finance (mudaraba, musharaka), digitalised tontines. Real case: a successful crowdfunding campaign in Tunisia. Activity: design a complete crowdfunding campaign (page, video, rewards, communication plan).\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback. Level 2 — financing and term sheet quiz. Level 3 — deliverable: complete pitch deck + 18-month financing plan. Level 4 — funds actually raised or aid obtained within 6 months.\n\nAndragogical principles: personalised options mapping, intensive pitch practice, real documents, peer learning and group feedback, local investor testimonials.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 8. Team Management & Leadership ─────────────────────────────────────────
(
  'Team Management & Leadership',
  'entrepreneurship',
  'Recruit, motivate, and lead a startup team within the Maghreb cultural context: hiring, company culture, remote management, and situational leadership.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on team management and leadership in the North African startup context.\n\nModule 1 — Hiring in a startup: attracting talent in an ecosystem where large corporates and public service dominate, recruitment channels (LinkedIn, ReKrute, Emploi.tn, Bayt), structured interviews, culture fit vs skill fit. Specificities: brain drain, competition from European salaries for developers. Real case: how Chari structured its hiring during hyper-growth. Activity: write an attractive job posting for a first startup hire and simulate an interview.\n\nModule 2 — Company culture and values: defining and embodying values, onboarding, team rituals. Cultural specificities: implicit hierarchy, relationship to authority, indirect communication, respect for elders. Real case: company culture at Yassir — reconciling rapid growth with Algerian identity. Activity: collaborative workshop — define your startup''s culture charter.\n\nModule 3 — Situational leadership: adapted Hersey-Blanchard model, when to direct, coach, support, or delegate. Managing conflict in a context where direct confrontation is culturally sensitive. Activity: situational case studies — which leadership posture for each scenario? Role play with 360-degree feedback.\n\nModule 4 — Remote management and distributed teams: tools (Slack, Notion, Linear), async rituals, time and productivity management. Specific challenges: variable internet connectivity, presenteeism culture, blurred work-life boundaries. Real case: Tunisian startups with teams across Tunis, Paris, and Canada. Activity: design a complete remote management system for a 5-person team.\n\nModule 5 — Talent retention and development: career paths in startups, equity/stock options (limited legal framework in the Maghreb), continuous learning, managing demotivation. Activity: build a retention plan for a senior developer tempted by a European offer.\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback. Level 2 — leadership and management quiz. Level 3 — deliverable: culture charter + 6-month hiring plan. Level 4 — turnover rate and team satisfaction measured at 6 months.\n\nAndragogical principles: management role plays (hiring, feedback, conflict), introspection on personal leadership style (self-assessment), culturally anchored Maghreb cases, peer learning (professional co-development).",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 9. Scaling & Internationalisation ───────────────────────────────────────
(
  'Scaling & Internationalisation',
  'entrepreneurship',
  'Go from 1 to 10 countries: expansion strategies into francophone Africa, customs regulations, mobile payments, and strategic partnerships. Cases: Chari, DabaDoc.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on scaling and internationalising North African startups.\n\nModule 1 — When and how to scale: readiness metrics (confirmed product-market fit, positive unit economics, reproducible processes), dangers of premature scaling. Framework: Reid Hoffman''s Blitzscaling adapted to African realities. Real case: Chari — from Morocco to Ivory Coast, partnership with OCP. Activity: scaling readiness diagnostic for your own project.\n\nModule 2 — Expansion into francophone Africa: market selection (Senegal, Ivory Coast, Cameroon — selection criteria), product adaptation, local hiring vs expatriation, local partners. Real case: DabaDoc — expanding medical appointment booking beyond Morocco. Activity: build a market selection matrix and choose the first 2 expansion countries.\n\nModule 3 — Cross-border regulations and logistics: free trade zones (AfCFTA), Morocco-ECOWAS bilateral agreements, customs regulations, money transfers (a major challenge), currencies and exchange rates. Activity: map the regulatory barriers for a Morocco-to-Senegal expansion case.\n\nModule 4 — Payments and fintech in Africa: mobile money (Orange Money, Wave, M-Pesa), online payment (CMI, Flouci, CIB), dominant cash, emerging crypto. Integrating the right payment providers per market. Real case: how super-apps (Yassir, Chari) integrate multi-country payments. Activity: design the payment architecture for a service operating in 3 countries.\n\nModule 5 — Strategic partnerships and M&A: corporate ventures, distributor partnerships, acquisitions. Negotiating with large groups (OCP, Sonatrach, Tunisie Telecom). Real case: Chari acquired by an international group — deal analysis. Activity: simulate a strategic partnership negotiation (startup vs corporate) with roles and confidential briefs.\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback. Level 2 — internationalisation quiz. Level 3 — deliverable: complete internationalisation plan (2 markets, 18-month timeline, budget). Level 4 — first international operation completed within 12 months.\n\nAndragogical principles: real African scaling cases, complex strategic decision simulations, group work on expansion scenarios, testimonials from founders who internationalised.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
),

-- ── 10. Resilience & Pivot ──────────────────────────────────────────────────
(
  'Resilience & Pivot',
  'entrepreneurship',
  'Manage crises, pivot strategically, and prevent entrepreneurial burnout. Testimonials of failure and recovery in the North African ecosystem, where the culture of failure is evolving.',
  '{
    "requirement": "Design an andragogical learning path (30% theory / 70% practice) on entrepreneurial resilience and strategic pivoting in North Africa.\n\nModule 1 — Anatomy of startup failure: statistics (90% of startups fail, yet failure remains taboo in North Africa), main causes (market, team, cash, timing), post-mortem analysis. Real cases: Maghreb startups that shut down — factual and respectful analysis. Activity: post-mortem workshop — deconstruct a real failure as a group.\n\nModule 2 — Crisis management: identifying weak signals, crisis plan (communication, cash, customers, team), decision-making under pressure. Specificities: crises linked to the North African context (regulatory instability, currency fluctuations, political crises). Real case: startups that survived COVID in the Maghreb. Activity: real-time crisis simulation — catastrophe scenario with decisions required every 5 minutes.\n\nModule 3 — Strategic pivot: recognising the pivot moment, types (zoom-in, zoom-out, customer segment, channel, technology), structured methodology. Real cases: Maghreb startups that pivoted successfully (examples: B2C to B2B shift, local market to export). Activity: from a struggling startup scenario, propose and argue a pivot in sub-groups.\n\nModule 4 — Personal resilience and burnout: burnout prevalence among entrepreneurs (70% according to studies), warning signs, prevention strategies, work-life balance in cultures where entrepreneurs are expected to sacrifice everything. Specificities: family and social pressure in the Maghreb, stigma of failure. Activity: resilience self-diagnostic + personal burnout prevention plan. Talking circle (adapted Balint format).\n\nModule 5 — Support ecosystem and bouncing back: incubators, accelerators, mentors, communities (Startup Maroc, Tunisian Startups, Algeria Startup Challenge), psychological support networks. Building your peer community. Real case: testimony of an entrepreneur who bounced back after failure — complete journey. Activity: map your personal support ecosystem and identify 3 actions to strengthen it.\n\nAssessment (Kirkpatrick-aligned): Level 1 — feedback and well-being check. Level 2 — crisis management and pivot quiz. Level 3 — deliverable: personal contingency plan (crisis scenarios + responses) and well-being plan. Level 4 — has the entrepreneur activated their support network and maintained balance 6 months later?\n\nAndragogical principles: safe speaking space (confidentiality rules), authentic testimonials, immersive crisis simulation, guided introspection, destigmatising failure in the North African cultural context, peer support.",
    "language": "en-US"
  }'::jsonb,
  ARRAY['formation-design-pro'],
  'en-US'
);
