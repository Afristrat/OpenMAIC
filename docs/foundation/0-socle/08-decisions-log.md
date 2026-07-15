# 08 — Decisions log (ADR) · Chantier 0 — SOCLE

> **Fil conducteur** — Mémoire longue du chantier ; les ADR transverses (option C′, licence, PWA) vivent ICI parce que le socle est le tronc — les chantiers 1-4 y renvoient par numéro et n'ouvrent des ADR que pour leurs choix propres. Format : Quoi / Pourquoi / Sources / Alternatives rejetées. S'alimente en continu.

## ADR-001 — Option C′ : greenfield v0.3.0 + copie-adaptation sélective (ACTÉE)

- **Quoi** : nouvelle base = upstream v0.3.0 vierge + copie-adaptation de nos personnalisations (socle d'abord, pioche pull-based ensuite) ; `main` = carrière figée en lecture seule.
- **Pourquoi** : arbitrage d'Amine (2026-07-09 option C, affinée C′ le 2026-07-10 : « nous n'allions garder que nos personnalisations […] un copier-adapter est de loin plus simple »). La mesure confirme : 264 OURS_ONLY copiables tels quels, 845 UPSTREAM_ONLY sans conflit, 257 BOTH_DIFFER convertis de préalable en catalogue de pioche (29 732 lignes dont 68 % dans 30 fichiers qu'on n'arbitrera peut-être jamais).
- **Sources** : `refork/inventaire.md` + `inventaire.json` (mesure locale scriptée, 2026-07-09) ; `docs/np-cadrage.md` §6-7.
- **Alternatives rejetées** : A (rattrapage sélectif sur notre base — 153 commits à rejouer à l'envers) ; B (rattrapage intégral — même problème, plus gros) ; C stricte (rejouer nos 146 commits sur v0.3.0 — impossible sur les fichiers éclatés par l'upstream, ex. `stage.tsx` 1360 lignes chez nous vs 167 upstream).

## ADR-002 — Licence du fork : CODE FERMÉ sur base MIT, après purge de provenance (VERDICT COUNCIL 2026-07-10 — tranche finale Amine)

- **Quoi** : option C — le re-fork devient propriétaire/fermé (base MIT v0.3.0, notices MIT conservées dans les en-têtes ; `THIRD-PARTY-NOTICES` joint à toute livraison on-premise). Ma proposition initiale « rester AGPL » est RETIRÉE : le council l'a démontée (réflexe procurement anti-AGPL des juristes bancaires + §13 sans bénéfice + le moat ne se protège pas par la licence du code).
- **Préalable non négociable (audit fait, `refork/audit-provenance.json`)** : sur 264 fichiers OURS_ONLY, 229 = créations 100 % à nous (libres) ; **35 = provenance AGPL-only potentielle** (templates prompts, i18n, 5 composants — majorant : v0.3.0 restructurée peut en republier l'équivalent MIT ailleurs). Purge obligatoire : mapper vers l'équivalent v0.3.0 OU réécrire depuis la base MIT — **zéro copie depuis v0.1.0** (story S0-014).
- **Séquence corrigée (divergence assumée avec l'Executor du council)** : le repo public actuel EST la conformité §13 de la prod AGPL en cours — ne PAS le passer en privé tant que la prod tourne dessus. Ordre : purge des 35 → re-fork assaini → bascule prod (gates S0-011/S0-012 inchangés) → alors seulement, privatisation (ou nouveau repo privé pour le re-fork, l'ancien restant l'archive publique AGPL).
- **Pourquoi** : verdict unanime du council (5 conseillers + 3 revues croisées + chairman) ; MIT n'impose AUCUNE publication de source (seule obligation : conserver notices copyright/licence dans les copies distribuées ; SaaS pur = pas de distribution) ; la due diligence IP des banques (SBOM, scan licences) sera le vrai juge → le dossier de provenance (audit JSON + historique git) est un actif commercial.
- **Sources** : `upstream-v030/LICENSE` (MIT, lu) ; `refork/audit-provenance.json` (audit scripté 2026-07-10) ; texte licence MIT (obligation limitée aux « copies or substantial portions ») ; AGPL-3.0 §13 (« Remote Network Interaction ») ; transcript council 2026-07-10.
- **Alternatives rejetées** : A rester AGPL (tuée commercialement — procurement bancaire) ; B publier MIT (donne le moat aux concurrents) ; D dual licensing (impossible sans pleine titularité — THU-MAIC co-auteur des fichiers hérités ; reste ouvrable PLUS TARD sur le seul périmètre 100 % détenu, décision business Amine).
- **Diligence non bloquante** : légitimité du relicenciement AGPL→MIT côté THU-MAIC (multi-contributeurs sans CLA ?) — une ligne du dossier de provenance à documenter, pas un bloqueur (si invalide, le problème frappe tous les utilisateurs de v0.3.0, et notre exposition propre est neutralisée par la purge).

## ADR-003 — App mobile : PWA d'abord (ACTÉE, décision déléguée à Claude par Amine)

- **Quoi** : le canal « app » de la vision (consommation, replay, pushes 10-90 j) = la PWA existante (manifest, service workers, push réel), pas d'app native en v1.
- **Pourquoi** : tout existe déjà et se copie (OURS_ONLY) ; le push PWA est le seul canal notification RÉEL du code actuel (e-mail/WhatsApp = placeholders) ; natif = coût store/build sans exigence produit démontrée.
- **Sources** : `public/manifest.json`, `sw.js`, `sw-notifications.js`, `lib/notifications/index.ts` (audit 2026-07-09, fichier:ligne dans np-cadrage §3).
- **Alternatives rejetées** : React Native/Expo immédiat — re-développement d'une UI qui existe ; à réexaminer si un besoin device natif apparaît (déclencheur : story chantier 3 infaisable en PWA).

## ADR-004 — Exécutant du chantier : Ralph loop, temps compté en itérations (ACTÉE)

- **Quoi** : le portage est découpé en stories à critères binaires vérifiables machine, exécutées par Ralph ; les seuls points humains sont S0-011 et S0-012.
- **Pourquoi** : correction d'Amine (2026-07-10 : « le mode ralph ferait tout cela en quelques heures ») — les estimations en « nuits humaines » étaient la mauvaise unité.
- **Sources** : protocole `~/.claude/skills/ralph-mode` ; historique : 72 stories déjà livrées par ce mode sur ce projet.
- **Alternatives rejetées** : portage manuel session par session (lent, sujet à dérive de contexte).

## ADR-005 — Critère de bascule prod explicite (ACTÉE dans le principe, contenu = S0-011)

- **Quoi** : la prod ne bascule sur la nouvelle base qu'après (a) tranche d'Amine sur la liste garder/abandonner des features des 72 stories, (b) passe RTL validée, (c) parité e2e sur le périmètre gardé. Réversible par branche.
- **Pourquoi** : repartir de v0.3.0 fait mécaniquement disparaître les features non repiochées — sans critère, les régressions seraient découvertes par les utilisateurs.
- **Sources** : inventaire (264 OURS_ONLY dont les features des 72 stories) ; np-cadrage §6 (risque résiduel C′).
- **Alternatives rejetées** : bascule à « parité totale » (contredit C′ : on ne garde QUE nos personnalisations utiles) ; bascule au feeling (inacceptable, règle n°2).

## ADR-006 — Feature flags en table plutôt que branches longues (ACTÉE)

- **Quoi** : table `feature_flags` (02-data-dictionary) ; les chantiers 1-3 livrent en continu sur la base unique, features en cours abritées par flag.
- **Pourquoi** : trois chantiers en parallèle sur une base = les branches longues recréeraient le problème du fork divergent qu'on vient de payer ; un flag DB est l'échelon natif (Ponytail) vs un système de flags SaaS externe.
- **Sources** : leçon directe du présent chantier (146 commits divergents → 3 sessions de mesure/arbitrage).
- **Alternatives rejetées** : branches longues par chantier ; service de flags externe (LaunchDarkly et équivalents — échelon 5 non justifié).

## ADR-007 — Un fichier 03-claude-directives par chantier (ACTÉE, adaptation de la spec np)

- **Quoi** : la spec np prévoit UN CLAUDE.md racine par projet ; avec 5 dossiers de chantier, le doc n°3 de chaque dossier devient `03-claude-directives.md`, le CLAUDE.md racine du repo restant le tronc commun.
- **Pourquoi** : Claude Code ne charge automatiquement qu'un CLAUDE.md par répertoire ; 5 CLAUDE.md de chantier seraient morts ou en conflit.
- **Alternatives rejetées** : tout fusionner dans le CLAUDE.md racine (dépasserait 150 lignes et mélangerait les chantiers).
