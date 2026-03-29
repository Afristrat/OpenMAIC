# Qalem — Document Exhaustif des Fonctionnalités

> **Objectif** : Fournir au designer frontend UI/UX toutes les informations nécessaires pour concevoir une landing page et une expérience produit où chaque fonctionnalité est un "stop scrolling" qui convertit.
>
> **Format** : Pour chaque fonctionnalité → Problème → Solution → Cas d'usage → Données chiffrées → Émotion à transmettre

---

## TABLE DES MATIÈRES

1. [Génération de Cours en 1 Clic](#1-génération-de-cours-en-1-clic)
2. [Classe Interactive Multi-Agents](#2-classe-interactive-multi-agents)
3. [Voix Naturelles Trilingues](#3-voix-naturelles-trilingues-frarben)
4. [Répétition Espacée Intelligente (FSRS)](#4-répétition-espacée-intelligente-fsrs)
5. [Hub MCP — L'Éducation Connectée](#5-hub-mcp--léducation-connectée)
6. [Intégration LMS via LTI 1.3](#6-intégration-lms-via-lti-13)
7. [Organisations & Multi-Tenant](#7-organisations--multi-tenant)
8. [Agent Bazaar — Marketplace d'Agents](#8-agent-bazaar--marketplace-dagents)
9. [Scene Genome — Plugins de Scènes](#9-scene-genome--plugins-de-scènes)
10. [Pedagogy Genome — L'IA qui Apprend à Enseigner](#10-pedagogy-genome--lia-qui-apprend-à-enseigner)
11. [Discussion Fingerprint — Orchestration Data-Driven](#11-discussion-fingerprint--orchestration-data-driven)
12. [Formation Design Pro — Ingénierie Andragogique](#12-formation-design-pro--ingénierie-andragogique)
13. [Certificats Vérifiables](#13-certificats-vérifiables)
14. [Mode Hors-Ligne / PWA](#14-mode-hors-ligne--pwa)
15. [Paiement Mobile Africain](#15-paiement-mobile-africain)
16. [Graphe de Curriculum](#16-graphe-de-curriculum)
17. [Reporting Institutionnel](#17-reporting-institutionnel)
18. [Whiteboard Interactif](#18-whiteboard-interactif)
19. [Export PPTX](#19-export-pptx)
20. [Self-Hosted / Souveraineté des Données](#20-self-hosted--souveraineté-des-données)

---

## 1. Génération de Cours en 1 Clic

### Le Problème
Un formateur professionnel au Maroc passe **10 à 15 jours** pour créer un programme de formation de 30 heures. Il doit structurer le contenu, créer des slides, rédiger des quiz, concevoir des exercices — le tout manuellement. Les centres de formation qui veulent répondre à Maroc Digital 2030 (100 000 talents/an) n'ont pas assez de formateurs pour produire le contenu nécessaire.

### La Solution Qalem
L'utilisateur décrit un sujet en une phrase. Qalem génère en **moins de 5 minutes** :
- Un plan de cours structuré (outlines)
- Des slides animées avec narration
- Des quiz avec correction automatique
- Des simulations interactives (HTML autonomes)
- Des activités PBL (Project-Based Learning)

### Cas d'usage concret
> **Fatima**, directrice pédagogique d'un centre OFPPT à Casablanca, doit créer une formation "Introduction au Marketing Digital" pour 200 stagiaires qui commencent lundi. Elle tape le sujet dans Qalem vendredi à 17h. À 17h05, le cours complet est prêt — slides, quiz, exercices pratiques. Elle le revoit, ajuste 2-3 points, et c'est déployé pour lundi.

### Données chiffrées
- **Pipeline** : 3 étapes (Requirements → Outlines → Scenes)
- **11 providers LLM** supportés (Gemini, Claude, GPT, DeepSeek, Qwen, etc.)
- **4 types de scènes** : Slides, Quiz, Interactif, PBL
- **Temps** : ~2-5 min pour un cours de 10 scènes

### Émotion à transmettre
**Libération** — "Ce qui prenait des semaines ne prend plus que des minutes. Vous n'avez plus d'excuse pour ne pas former."

### Éléments UI suggérés
- Vidéo : un curseur qui tape → barre de progression → cours complet qui apparaît
- Compteur animé : "15 jours → 5 minutes"
- Démonstration live intégrée à la landing page

---

## 2. Classe Interactive Multi-Agents

### Le Problème
Les formations en ligne sont **ennuyeuses**. L'apprenant est seul devant un écran, passif, sans interaction. Le taux d'abandon des MOOC est de **90%+**. Il n'y a personne pour poser des questions, personne pour rire, personne pour challenger. C'est un monologue déguisé en formation.

### La Solution Qalem
Qalem crée une **vraie dynamique de classe** avec 6 agents IA qui jouent des rôles distincts :

| Agent | Rôle | Ce qu'il fait |
|-------|------|---------------|
| **Professeur IA** | Enseignant principal | Présente le cours, utilise spotlight/laser, dessine au tableau |
| **Assistant Pédagogique** | Support | Reformule, simplifie, donne des exemples concrets |
| **Le Rigolo** | Énergie | Blagues, références pop culture, allège l'atmosphère |
| **Le Curieux** | Questions | Pose les questions que l'apprenant n'ose pas poser |
| **Le Secrétaire** | Notes | Résume, structure, écrit les formules au tableau |
| **Le Penseur** | Profondeur | Connexions inattendues, devil's advocate, "Et si..." |

Le **Director** (LangGraph StateGraph) orchestre les interventions — qui parle quand, combien de temps, avec quelle intensité.

### Cas d'usage concret
> **Ahmed**, étudiant en informatique à l'UIR, suit un cours sur les bases de données. Le Professeur explique les jointures SQL. Ahmed est perdu. Le Curieux intervient : "Attendez, pourquoi on ne ferait pas juste deux requêtes séparées ?" Le Professeur explique la différence de performance. Le Rigolo ajoute : "C'est comme commander un Big Mac et des frites séparément vs le menu — le résultat est pareil mais ça coûte plus cher en requêtes 😄". Ahmed comprend enfin.

### Données chiffrées
- **6 agents** par défaut (personnalisables)
- **15+ actions** : spotlight, laser, speech, 8 types whiteboard, discussion, vidéo
- **Director LangGraph** avec orchestration multi-tours
- **Voix distincte par agent** via TTS

### Émotion à transmettre
**Appartenance** — "Vous n'êtes plus seul devant un écran. Vous avez une classe entière qui apprend avec vous."

### Éléments UI suggérés
- Capture d'écran annotée de la roundtable avec les 6 avatars
- Animation : les agents qui "réagissent" en temps réel (bulles, émojis)
- Témoignage : "Je me suis surpris à rire pendant un cours en ligne" — un beta testeur

---

## 3. Voix Naturelles Trilingues (FR/AR/EN)

### Le Problème
Les plateformes éducatives existantes parlent anglais. Quand elles ont du français, c'est du **TTS robotique** qui donne envie de couper le son. L'arabe ? Oubliez. La darija marocaine ? Inexistant. Résultat : les apprenants francophones et arabophones sont des citoyens de seconde zone du e-learning.

### La Solution Qalem
**9 providers TTS** avec des voix qui sonnent humaines :

| Provider | FR | AR | Darija | Latence | Spécialité |
|----------|----|----|--------|---------|------------|
| **ElevenLabs** | 9/10 | 7.5/10 | ✓ (Ghizlane) | 75-300ms | Naturalité premium |
| **Fish Audio S2** | 9/10 | 8/10 | — | ~100ms | 50+ émotions |
| **Cartesia Sonic 3** | 8.5/10 | 8/10 | — | **40ms** | Ultra-basse latence |
| **Azure Neural** | 7.5/10 | 7/10 | — | 150-300ms | Fiabilité enterprise |
| + 5 autres | Variable | Variable | — | Variable | Options budget |

Le **voice resolver** assigne automatiquement des voix dans la langue de l'utilisateur. Le professeur a une voix adulte posée, les étudiants des voix jeunes et dynamiques.

### Cas d'usage concret
> **Khadija**, formatrice à Marrakech, crée un cours en arabe sur la gestion de stock. Elle clique "Entrer en classe". Le professeur IA commence à expliquer — **en arabe**, avec un accent naturel, pas robotique. Quand le Rigolo intervient, c'est avec une voix plus jeune et énergique. Khadija n'en revient pas : "On dirait de vrais gens."

### Émotion à transmettre
**Fierté linguistique** — "Votre langue n'est pas un sous-produit. Elle est au centre de l'expérience."

### Éléments UI suggérés
- Bouton "Écouter un extrait" en FR, AR, EN directement sur la landing page
- Waveform animée pendant la lecture
- Drapeau + "Ghizlane — voix darija" comme démonstration du respect culturel

---

## 4. Répétition Espacée Intelligente (FSRS)

### Le Problème
Après une formation, les apprenants oublient **70% du contenu en 24 heures** (courbe d'Ebbinghaus). Les formations coûtent cher mais le ROI est catastrophique parce que personne ne révise. Les entreprises dépensent, les apprenants oublient, et on recommence.

### La Solution Qalem
Après chaque quiz, les concepts mal maîtrisés deviennent des **cartes de révision**. L'algorithme FSRS-5 (le même que dans Anki, l'outil de révision le plus efficace au monde) calcule le **moment optimal** pour chaque révision :

```
Concept facile → revoir dans 7 jours → 21 jours → 60 jours
Concept difficile → revoir demain → dans 3 jours → 7 jours → 14 jours
```

L'apprenant reçoit des rappels (push, email, **WhatsApp**) quand c'est le moment de réviser. 5 minutes par jour suffisent.

### Cas d'usage concret
> **Youssef**, stagiaire OFPPT en transport multimodal, a fait la formation sur les Incoterms il y a 3 semaines. Il a oublié la différence entre FOB et CIF. Ce matin, il reçoit un message WhatsApp : "🧠 3 cartes à réviser — 2 min". Il ouvre Qalem, voit la question, se souvient de la réponse, rate "CIF". FSRS recalcule : il reverra CIF dans 2 jours. FOB dans 14 jours (il l'a eu du premier coup).

### Données chiffrées
- **Algorithme** : FSRS-5 (19 paramètres, personnalisés par utilisateur)
- **Taux de rétention cible** : 90% (vs 30% sans révision)
- **31 tests unitaires** validant l'algorithme
- **Notifications** : push PWA + email + WhatsApp (Evolution API)

### Émotion à transmettre
**Confiance** — "Vous n'oublierez plus jamais. L'algorithme se souvient pour vous."

### Éléments UI suggérés
- Graphique animé de la courbe d'oubli (avec vs sans FSRS)
- Capture du message WhatsApp avec la notification de révision
- Compteur : "Rétention 90% vs 30% — 3x plus efficace"

---

## 5. Hub MCP — L'Éducation Connectée

### Le Problème
Les outils éducatifs sont des **silos**. NotebookLM ne parle pas à Moodle. Google Docs ne génère pas de quiz. Le formateur jongle entre 5-10 outils qui ne communiquent pas. Copier-coller est devenu son activité principale.

### La Solution Qalem
Qalem est un **hub MCP (Model Context Protocol)** bidirectionnel :

**Direction 1 — Qalem consomme** (MCP Client) :
- NotebookLM → les agents citent vos sources en temps réel
- Notion → importez vos pages comme matériau de cours
- Google Drive → utilisez vos documents directement

**Direction 2 — Qalem est consommé** (MCP Server) :
- N'importe quel agent IA (Claude, Gemini, GPT) peut appeler Qalem comme outil
- `generate_classroom(topic)` → retourne un cours complet
- `get_quiz(topic)` → retourne un quiz structuré

### Cas d'usage concret
> **Omar**, consultant en stratégie, a un notebook NotebookLM avec 50 pages d'analyse sectorielle. Il connecte NotebookLM à Qalem. Il tape "Créer une formation sur l'analyse SWOT à partir de mes notes". Qalem génère un cours qui **cite ses propres sources** — pas du contenu générique, mais des slides basées sur SES données.

### Émotion à transmettre
**Puissance** — "Vos outils ne sont plus des silos. Qalem les connecte tous."

### Éléments UI suggérés
- Schéma hub-and-spoke avec Qalem au centre et les logos des services connectés
- Animation : données qui "fluent" de NotebookLM vers Qalem vers le cours

---

## 6. Intégration LMS via LTI 1.3

### Le Problème
Les universités et centres de formation ont **déjà** un LMS (Moodle, Canvas). Ils ne vont pas le remplacer — c'est trop cher, trop risqué, trop d'effort. Tout nouvel outil qui ne s'intègre pas dans l'existant est **mort-né** dans l'institutionnel.

### La Solution Qalem
Qalem est un **LTI 1.3 Tool Provider**. En 10 minutes, l'administrateur Moodle ajoute Qalem comme "Outil externe". Ensuite :
1. L'enseignant crée un cours dans Qalem
2. Il l'ajoute comme activité dans Moodle
3. Les étudiants lancent le cours **depuis Moodle**
4. Les notes de quiz **remontent automatiquement** au carnet de notes Moodle

Zero changement de workflow pour l'enseignant. Zero migration.

### Cas d'usage concret
> **Dr. Benani**, professeur à l'UM6P, utilise Moodle depuis 5 ans. Il ne veut pas changer. Mais il veut de l'IA dans ses cours. L'administrateur ajoute Qalem en 10 minutes. Dr. Benani crée un cours Qalem sur les réseaux de neurones. Ses étudiants le lancent depuis Moodle, font le quiz, et la note apparaît dans le gradebook Moodle. Dr. Benani n'a rien changé à ses habitudes.

### Données chiffrées
- **Standard** : LTI 1.3 (IMS Global, compatible Moodle 4+, Canvas, Blackboard, Google Classroom)
- **Grades** : LTI Assignment and Grade Services (AGS) — notes 0-100 automatiques
- **Auth** : OIDC + JWT + JWKS — sécurité enterprise

### Émotion à transmettre
**Sérénité** — "Pas besoin de tout changer. Qalem s'intègre dans ce que vous avez déjà."

### Éléments UI suggérés
- Capture d'écran : un cours Qalem DANS Moodle (inception)
- Flèche : "Note 85/100" qui remonte de Qalem vers le gradebook Moodle
- Logo LTI 1.3 comme badge de confiance

---

## 7. Organisations & Multi-Tenant

### Le Problème
Un centre de formation avec 20 formateurs et 500 stagiaires ne peut pas gérer ça avec des comptes individuels. Il faut des rôles (admin, formateur, apprenant), une bibliothèque partagée, des templates par secteur, et du reporting.

### La Solution Qalem
Système organisationnel complet :
- **4 rôles RBAC** : Admin → Manager → Formateur → Apprenant
- **Bibliothèque partagée** : les cours créés par un formateur sont accessibles à tous ses collègues
- **Templates par secteur** : 12 templates pré-configurés (santé, juridique, tech, finance, éducation, industrie)
- **Invitation par email** : l'admin invite, le formateur crée, l'apprenant apprend

### Cas d'usage concret
> **SkillsCampus Casablanca** a 15 formateurs dans 5 domaines. L'admin crée l'organisation, invite les formateurs. Chacun crée des cours dans son domaine. Un formateur marketing crée un cours brillant — il le partage dans la bibliothèque. Le formateur vente le réutilise pour ses stagiaires. L'admin voit dans le dashboard : 500 apprenants formés, score moyen 78%, taux de complétion 72%.

### Données chiffrées
- **4 rôles** extensibles à des rôles custom
- **12 tables Supabase** avec RLS sur chacune
- **12 templates sectoriels** pré-chargés
- **30 templates entrepreneuriat** FR/AR/EN

### Émotion à transmettre
**Contrôle** — "Votre centre de formation, vos règles. Tout est organisé, rien ne se perd."

### Éléments UI suggérés
- Dashboard organisationnel avec métriques en temps réel
- Vue "bibliothèque" avec les cours en grille
- Organigramme des rôles avec badges couleur

---

## 8. Agent Bazaar — Marketplace d'Agents

### Le Problème
Chaque formateur a son style, ses méthodes, sa personnalité d'enseignement. Mais dans les plateformes IA, tout le monde a le même assistant générique. Le "one size fits all" ne fonctionne pas en éducation.

### La Solution Qalem
Une marketplace où les formateurs peuvent :
- **Créer** des agents pédagogiques avec des personas uniques
- **Publier** ces agents pour que d'autres les utilisent
- **Importer** les agents les mieux notés en 1 clic
- **Voir le classement** par performance réelle (quiz scores des apprenants)

Le badge "Top Agent" (top 10%) est basé sur des données empiriques, pas des likes.

### Cas d'usage concret
> **Nadia**, formatrice en comptabilité, crée un agent "Expert-Comptable" avec un persona ultra-précis : terminologie comptable marocaine, références au Plan Comptable Général Marocain, ton professionnel. Elle le publie sur la marketplace. En 3 mois, 200 formateurs l'ont importé. L'agent a le badge "Top Agent" parce que les apprenants qui l'utilisent ont un score quiz 15% supérieur aux autres.

### Émotion à transmettre
**Communauté** — "Les meilleurs agents sont créés par les meilleurs formateurs. Trouvez le vôtre."

### Éléments UI suggérés
- Grille d'agents avec avatars, étoiles, badge "Top Agent" doré
- Filtre par matière/langue/niveau
- Compteur "Utilisé par 200+ formateurs"

---

## 9. Scene Genome — Plugins de Scènes

### Le Problème
Les formations en ligne sont toujours les mêmes : slides + quiz. Pas de simulation, pas de code, pas de labo virtuel. Les formations tech ont besoin de sandbox code. Les formations scientifiques ont besoin de simulations 3D. Aucune plateforme ne fait les deux.

### La Solution Qalem
Un **SDK de plugins** permet de créer de nouveaux types de scènes :

| Plugin | Ce qu'il fait |
|--------|--------------|
| **Code Sandbox** | Éditeur Monaco (comme VS Code) + exécution JS/Python (Pyodide) + tests automatiques |
| **Lab Simulation 3D** | Three.js + physique (cannon-es) — projectile, pendule, ressort — avec sliders de paramètres et graphiques temps réel |
| **À venir** | Simulation financière, lab chimie, plan d'architecture... |

Chaque plugin s'exécute dans un **iframe sandboxé** (sécurité) et communique avec Qalem via postMessage.

### Cas d'usage concret
> **Rachid**, formateur en développement web à l'OFPPT, crée un cours "Introduction à Python". La scène interactive est un **vrai éditeur de code** dans le navigateur. L'apprenant écrit sa fonction, clique "Exécuter", voit le résultat. L'IA évalue automatiquement le code et donne du feedback.

> **Dr. Amina**, professeure de physique à l'UIR, crée un cours sur la mécanique. La simulation 3D montre un projectile en mouvement. L'étudiant ajuste la masse, l'angle, la vitesse — et voit en temps réel la trajectoire changer. Le graphique position/temps se dessine sous ses yeux.

### Émotion à transmettre
**Émerveillement** — "Ce n'est plus un cours. C'est un laboratoire dans votre navigateur."

### Éléments UI suggérés
- Split screen : code à gauche, résultat à droite (capture Code Sandbox)
- Simulation 3D avec particule en mouvement + graphiques (capture Lab Simulation)
- Badge "Interactif" sur les scènes qui le méritent

---

## 10. Pedagogy Genome — L'IA qui Apprend à Enseigner

### Le Problème
Aucune plateforme éducative ne sait **quel séquençage de cours produit le meilleur apprentissage**. Est-ce qu'il vaut mieux commencer par un quiz puis un cours, ou l'inverse ? Personne n'a la donnée. Chaque cours est généré à l'aveugle.

### La Solution Qalem
Chaque session génère des données anonymisées : séquence de scènes, temps par scène, scores quiz, taux de complétion. Le **Pedagogy Genome** agrège ces données et découvre les patterns :

> "Pour le sujet X, au niveau Y, la séquence Slide → Interactive → Quiz produit un taux de rétention de 78% vs 54% pour Slide → Slide → Quiz."

Le pipeline de génération **consomme** ces insights pour ordonner les scènes de manière optimale.

### Cas d'usage concret
> Après 10 000 sessions, Qalem découvre que pour les cours de marketing, commencer par un quiz de pré-évaluation puis une simulation interactive avant les slides théoriques augmente la rétention de **23%**. Ce pattern est automatiquement appliqué à tous les futurs cours de marketing. Le formateur n'a rien à faire — le système s'améliore tout seul.

### Données chiffrées
- **Seuil d'activation** : 100 sessions/sujet minimum
- **Anonymisation** : SHA-256 avec sel, aucune PII
- **Consentement** : opt-in explicite, RGPD/CNDP compliant
- **Impact estimé** : +15-25% de rétention après calibration

### Émotion à transmettre
**Magie** — "Plus vous l'utilisez, meilleur il devient. Qalem apprend à enseigner."

### Éléments UI suggérés
- Graphique : courbe de performance qui monte au fil des sessions
- Phrase : "Basé sur 10 000 sessions d'apprentissage"
- Icône cerveau avec des connexions neuronales qui se forment

---

## 11. Discussion Fingerprint — Orchestration Data-Driven

### Le Problème
Dans une vraie classe, le meilleur professeur sait **quand** faire intervenir un élève, **quand** poser une question provocante, **quand** faire une pause. C'est de l'art. Les chatbots IA n'ont aucune idée de cette orchestration — ils répondent bêtement à tour de rôle.

### La Solution Qalem
Le **Discussion Fingerprint** collecte les patterns de discussion multi-agent et les corrèle avec les résultats d'apprentissage :

> "Quand le Curieux pose une question après l'explication du Professeur, et que le Penseur enchaîne avec un contre-argument, les scores quiz augmentent de 12%."

Le **Director Data-Driven** utilise ces patterns empiriques pour orchestrer les discussions de manière optimale, avec un **A/B test** intégré (50% classique, 50% data-driven) pour mesurer l'amélioration.

### Émotion à transmettre
**Intelligence** — "Ce n'est pas du hasard. Chaque intervention est calculée pour maximiser votre apprentissage."

---

## 12. Formation Design Pro — Ingénierie Andragogique

### Le Problème
La plupart des cours IA sont générés comme pour des enfants : chapitres académiques, 70% théorie, QCM génériques. Mais les apprenants sont des **adultes professionnels** (25-55 ans) qui veulent résoudre des problèmes **réels**, pas mémoriser des définitions.

### La Solution Qalem
Le skill **Formation Design Pro** injecte les **standards internationaux d'ingénierie pédagogique** dans chaque cours généré :

| Méthodologie | Ce qu'elle apporte |
|-------------|-------------------|
| **ADDIE** | Pipeline structuré : Analyse → Design → Développement → Implantation → Évaluation |
| **Bloom** | Objectifs cognitifs précis (Analyser, Évaluer, Créer — pas juste "Comprendre") |
| **Kirkpatrick** | 4 niveaux d'évaluation (Réaction → Apprentissage → Comportement → Résultats) |
| **Knowles** | 6 principes andragogiques (besoin de savoir, autonomie, expérience, applicabilité immédiate, orientation problème, motivation intrinsèque) |

**Ratio obligatoire** : 30% théorie / 70% pratique. 60%+ cas Maroc/Afrique.

### Cas d'usage concret
> **L'OFPPT** veut des formations "conformes aux standards internationaux" pour les accréditations. Avec Formation Design Pro activé, chaque cours Qalem est automatiquement structuré ADDIE, avec des objectifs Bloom et des évaluations Kirkpatrick. L'auditeur ouvre le syllabus → "C'est conforme." Pas de travail supplémentaire pour le formateur.

### Émotion à transmettre
**Professionnalisme** — "Des formations qui passent les audits. Pas du bricolage IA."

### Éléments UI suggérés
- Badges : "ADDIE ✓", "Bloom ✓", "Kirkpatrick ✓", "Knowles ✓"
- Comparaison côte à côte : cours IA générique vs cours Qalem andragogique
- Citation : "30% théorie, 70% pratique — comme les vrais pros"

---

## 13. Certificats Vérifiables

### Le Problème
Les certificats de formation en ligne n'ont **aucune valeur**. Personne ne peut vérifier s'ils sont vrais. Les recruteurs les ignorent. Les apprenants n'ont aucune motivation à terminer parce que le certificat ne vaut rien.

### La Solution Qalem
Un certificat avec un **QR code unique** vérifiable par n'importe qui :
- Le recruteur scanne le QR → voit le nom, le cours, la date, le score
- L'apprenant partage sur LinkedIn avec un lien vérifiable
- L'organisation a un historique auditable de toutes les certifications

Format : `QAL-2026-ABCD1234` → `qalem.example/verify/QAL-2026-ABCD1234`

### Cas d'usage concret
> **Samir** termine la formation "Levée de Fonds" sur Qalem avec un score de 87%. Il reçoit un certificat avec QR code. Il l'ajoute à son profil LinkedIn. Un investisseur voit le certificat, scanne le QR, confirme que c'est authentique. Samir gagne en crédibilité.

### Émotion à transmettre
**Légitimité** — "Un certificat qui prouve vraiment ce que vous savez."

### Éléments UI suggérés
- Certificat design premium avec QR code visible
- Animation : scan QR → checkmark vert "Vérifié ✓"
- Bouton LinkedIn "Ajouter à mon profil"

---

## 14. Mode Hors-Ligne / PWA

### Le Problème
En Afrique subsaharienne et dans les zones rurales du Maroc, la **connexion internet est intermittente**. Un étudiant à Errachidia ou Ouarzazate ne peut pas compter sur une connexion stable. Les plateformes cloud-only sont inutilisables.

### La Solution Qalem
Qalem est une **PWA** (Progressive Web App) avec :
- **App shell cachée** : l'interface charge même sans internet
- **Cours offline** : les classrooms déjà visités sont disponibles hors-ligne
- **Quiz et révision offline** : l'apprenant peut continuer à réviser sans connexion
- **Sync automatique** : quand la connexion revient, les données se synchronisent

### Cas d'usage concret
> **Imane**, stagiaire à l'OFPPT de Béni Mellal, prend le bus chaque matin (45 min, pas de réseau). Elle ouvre Qalem sur son téléphone — le cours qu'elle a commencé hier est toujours là, offline. Elle fait ses cartes de révision FSRS pendant le trajet. À l'arrivée au centre, tout se synchronise automatiquement.

### Émotion à transmettre
**Accessibilité** — "Internet ou pas, votre formation continue."

### Éléments UI suggérés
- Icône avion (mode offline) avec texte "Disponible hors-ligne"
- Bandeau discret : "Hors ligne — vos données sont sauvegardées"
- Comparaison : "Avec Qalem" (fonctionne partout) vs "Sans" (écran d'erreur)

---

## 15. Paiement Mobile Africain

### Le Problème
En Afrique francophone, **moins de 5% de la population** a une carte bancaire. Les plateformes internationales qui n'acceptent que Visa/Mastercard excluent 95% du marché. Orange Money, Wave et les solutions de paiement mobile sont le standard.

### La Solution Qalem
3 providers de paiement intégrés :
- **CinetPay** : agrégateur panafricain (Orange Money, MTN Money, Moov Money, etc.)
- **Orange Money** : direct, Maroc + Afrique de l'Ouest
- **Wave** : Sénégal, Côte d'Ivoire (gratuit pour l'envoyeur)

Webhook IPN pour confirmation automatique. Table Supabase pour l'historique.

### Émotion à transmettre
**Inclusion** — "Pas de carte bancaire ? Pas de problème. Payez comme vous payez déjà."

### Éléments UI suggérés
- Logos Orange Money + Wave + CinetPay
- "Payez avec votre téléphone" avec mockup téléphone
- Pricing en MAD/XOF (pas en USD)

---

## 16. Graphe de Curriculum

### Le Problème
Les formations sont des **îlots isolés**. Il n'y a pas de "parcours" — l'apprenant ne sait pas ce qu'il doit faire après, ni quels prérequis il a manqués. L'institution n'a pas de vue d'ensemble de son offre de formation.

### La Solution Qalem
Un **graphe interactif** (React Flow) où les cours sont des nœuds et les liens sont des relations :
- **Prérequis** (rouge) : "Faites Marketing 101 AVANT Marketing Avancé"
- **Suite** (bleu) : "Après Finance 101, suivez Finance 201"
- **Approfondit** (vert) : "Ce cours approfondit le concept X de..."
- **Révise** (orange) : "Ce cours révise les bases de..."

L'apprenant voit un "parcours recommandé" calculé automatiquement (tri topologique).

### Émotion à transmettre
**Clarté** — "Vous savez exactement où vous en êtes et où aller ensuite."

### Éléments UI suggérés
- Capture du graphe interactif avec nœuds colorés et liens
- Flèche "Parcours recommandé" en surbrillance
- Progression : nœuds verts (complétés), bleus (en cours), gris (à venir)

---

## 17. Reporting Institutionnel

### Le Problème
Les responsables formation passent des **heures** à compiler des rapports manuellement : combien d'apprenants formés ? Quel taux de complétion ? Quel score moyen ? Ces données sont éparpillées dans des Excel. Impossible de présenter un bilan propre aux accréditations.

### La Solution Qalem
Dashboard de reporting avec :
- **Métriques temps réel** : apprenants actifs, classrooms, score moyen, taux de complétion
- **Vue par apprenant** : progression, scores, temps passé, dernière activité
- **Vue par formation** : nombre d'apprenants, score moyen, taux d'abandon
- **Export** : PDF pour les accréditations, CSV pour l'analyse

### Émotion à transmettre
**Tranquillité** — "Les rapports se font tout seuls. Vous n'avez qu'à les présenter."

---

## 18. Whiteboard Interactif

### Le Problème
Un bon professeur ne se contente pas de slides. Il dessine, schématise, écrit des formules au tableau. Les plateformes en ligne suppriment cette dimension visuelle et spontanée.

### La Solution Qalem
Les agents IA peuvent dessiner sur un **whiteboard** en temps réel :
- Texte, formes, lignes
- Graphiques (ECharts)
- Formules LaTeX (KaTeX)
- Tableaux
- Historique et restauration

### Émotion à transmettre
**Authenticité** — "Comme dans une vraie salle de classe, le prof dessine ce qu'il explique."

---

## 19. Export PPTX

### Le Problème
Les formateurs veulent pouvoir **éditer** les contenus générés. Ils ne veulent pas être enfermés dans une plateforme. "Et si je veux présenter en présentiel sans Qalem ?"

### La Solution Qalem
Export en **PPTX** (PowerPoint) éditable. Le formateur génère sur Qalem, exporte, et présente en salle avec son laptop habituel.

### Émotion à transmettre
**Liberté** — "Généré par l'IA, édité par vous, présenté comme vous voulez."

---

## 20. Self-Hosted / Souveraineté des Données

### Le Problème
Les institutions publiques au Maroc (OFPPT, universités) ne peuvent pas envoyer les données de leurs étudiants sur des serveurs américains. La **CNDP** (Commission Nationale de contrôle de la protection des Données à caractère Personnel) l'interdit. Les solutions cloud-only sont éliminées d'office dans les appels d'offres publics.

### La Solution Qalem
Qalem est **100% self-hosted** :
- **Docker Compose** : 8 services (app + Supabase + Redis + MinIO) déployables en 15 minutes
- **Vos serveurs** : les données restent chez vous (OVH Maroc, serveur interne, etc.)
- **Open-source AGPL** : vous pouvez auditer chaque ligne de code
- **Pas de dépendance cloud** : fonctionne sur un réseau fermé si nécessaire

### Cas d'usage concret
> L'OFPPT lance un appel d'offres pour une plateforme de formation IA. Critère éliminatoire : "Les données des stagiaires doivent rester sur le territoire national." Coursera : éliminé. Khan Academy : éliminé. Google Classroom : éliminé. **Qalem** : conforme — déployé sur les serveurs OFPPT à Casablanca.

### Données chiffrées
- **8 services Docker** : app, PostgreSQL, GoTrue, PostgREST, Kong, Redis, MinIO, init
- **15 minutes** d'installation (script setup.sh)
- **4 Go RAM** minimum (serveur à ~200 MAD/mois)
- **AGPL-3.0** : code source 100% auditable

### Émotion à transmettre
**Souveraineté** — "Vos données, vos serveurs, vos règles. Personne d'autre n'y a accès."

### Éléments UI suggérés
- Icône serveur avec drapeau marocain
- "Déployé en 15 minutes sur VOS serveurs"
- Badge : "CNDP Compliant" / "RGPD Compliant"
- Comparaison : Qalem (drapeau Maroc, checkmark) vs Cloud US (croix rouge)

---

## SYNTHÈSE POUR LE DESIGNER

### Les 5 sections "Hero" de la landing page (ordre recommandé)

1. **Hero principal** : "Créez un cours complet en 5 minutes" → démo live / vidéo
2. **La classe vivante** : Les 6 agents + roundtable → capture animée
3. **Votre langue, votre voix** : FR / AR / Darija → boutons "Écouter"
4. **Pour les institutions** : LTI + Organisation + Reporting → dashboard
5. **Open-source, chez vous** : Self-hosted + CNDP → confiance

### Les 3 émotions dominantes à transmettre

1. **Gain de temps radical** (formateur) — "15 jours → 5 minutes"
2. **Engagement vivant** (apprenant) — "Vous n'êtes plus seul"
3. **Confiance institutionnelle** (décideur) — "Conforme, auto-hébergé, auditable"

### Les "stop scrolling" à concevoir

| Feature | Hook visuel | Micro-interaction |
|---------|------------|-------------------|
| Génération 1 clic | Compteur animé 15j → 5min | Barre de progression live |
| Multi-agents | Roundtable avec 6 avatars | Bulles qui apparaissent |
| Voix naturelles | Waveform + drapeau langue | Bouton "Écouter" inline |
| FSRS | Courbe d'oubli avant/après | Carte qui se retourne |
| Certificat | QR code qui se scanne | Checkmark vert animé |
| Offline | Icône avion + "fonctionne partout" | Toggle online/offline |
| Self-hosted | Serveur + drapeau | Badge CNDP/RGPD |
