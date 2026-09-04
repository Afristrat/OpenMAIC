# 08 — Decisions log (ADR) · Chantier 0 — SOCLE

> **Fil conducteur** — Mémoire longue du chantier ; les ADR transverses (option C′, licence, PWA) vivent ICI parce que le socle est le tronc — les chantiers 1-4 y renvoient par numéro et n'ouvrent des ADR que pour leurs choix propres. Format : Quoi / Pourquoi / Sources / Alternatives rejetées. S'alimente en continu.

## ADR-001 — Option C′ : greenfield v0.3.0 + copie-adaptation sélective (ACTÉE)

- **Quoi** : nouvelle base = upstream v0.3.0 vierge + copie-adaptation de nos personnalisations (socle d'abord, pioche pull-based ensuite) ; `main` = carrière figée en lecture seule.
- **Pourquoi** : arbitrage d'Amine (2026-07-09 option C, affinée C′ le 2026-07-10 : « nous n'allions garder que nos personnalisations […] un copier-adapter est de loin plus simple »). La mesure confirme : 264 OURS_ONLY copiables tels quels, 845 UPSTREAM_ONLY sans conflit, 257 BOTH_DIFFER convertis de préalable en catalogue de pioche (29 732 lignes dont 68 % dans 30 fichiers qu'on n'arbitrera peut-être jamais).
- **Sources** : `refork/inventaire.md` + `inventaire.json` (mesure locale scriptée, 2026-07-09) ; `docs/np-cadrage.md` §6-7.
- **Alternatives rejetées** : A (rattrapage sélectif sur notre base — 153 commits à rejouer à l'envers) ; B (rattrapage intégral — même problème, plus gros) ; C stricte (rejouer nos 146 commits sur v0.3.0 — impossible sur les fichiers éclatés par l'upstream, ex. `stage.tsx` 1360 lignes chez nous vs 167 upstream).

## ADR-002 — Séparation conditionnelle du re-fork après preuve de provenance

- **Statut** : décision produit conditionnelle, non exécutée. Le dépôt déclare actuellement `MIT` dans `LICENSE` et `package.json` ; il n'est donc pas factuellement « fermé » aujourd'hui.
- **Décision** : envisager un dépôt privé distinct uniquement après clôture reproductible de S0-014, validation des gates produit et revue juridique indépendante. La volonté commerciale de protéger le code reste inchangée ; son véhicule juridique n'est pas présumé par cette story technique.
- **Portée de S0-014** : démontrer la traçabilité technique des 35 chemins du majorant, issus de l'intersection entre l'upstream v0.1, la carrière finale et les chemins absents du snapshot MIT v0.3 importé. Cette preuve ne statue ni sur la validité du changement de licence upstream ni sur les droits applicables à une distribution future.
- **Méthode** : chaque chemin doit être mappé vers un équivalent du snapshot MIT, réécrit depuis ce snapshot selon une méthode clean-room documentée, ou supprimé comme obsolète avec son remplaçant fonctionnel identifié. `refork/audit-provenance.json` est généré et vérifié par la CI ; la liste résiduelle doit rester vide.
- **Notices** : conserver la notice MIT racine et joindre `THIRD-PARTY-NOTICES` aux livraisons on-premise. Ne pas affirmer l'existence d'en-têtes MIT absents des fichiers sources.
- **Blocage** : aucune privatisation, modification de licence ou déclaration de conformité ne découle automatiquement de `passes: true`. Ces actes exigent une décision séparée et une revue juridique.
- **Sources** : `LICENSE`, tag upstream `v0.3.0` au commit `da0b394b81745153b0dffd8537d0b2d1b94eaf61`, snapshot importé `14d31aa48d48909d9eb0b17dd35dc793381e2b00`, `refork/audit-provenance.json`, texte AGPL-3.0 et texte MIT.

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

## ADR-008 — E-mail et WhatsApp pour les révisions historiques, Web Push pour ANCRER (ACTÉE)

- **Quoi** : les trois canaux promis par S-028 sont conservés. L’e-mail et WhatsApp envoient au maximum un lot quotidien de cartes de révision arrivées à échéance, après opt-in distinct et révocable. Les graines et évaluations du chantier ANCRER restent exclusivement en Web Push conformément à l’ADR-303.
- **Pourquoi** : Amine a explicitement demandé de garder puis de coder toutes les capacités du PRD v1. La séparation évite d’étendre silencieusement le consentement ANCRER à deux canaux que son propre cadrage exclut, tout en livrant la promesse historique de révision multicanale.
- **Garanties** : préférences persistantes par compte, numéro international explicite, une livraison unique par utilisateur/canal/jour, e-mail idempotent chez Resend, aucune relance WhatsApp après une panne réseau ambiguë et erreurs enregistrées sous forme de codes sans contenu personnel.
- **Sources** : `.ralph/prd.json#S-028`, `tasks/prd-3-ancrer.md#Non-Goals`, mandat d’Amine du 2 septembre 2026 conservé dans `.ralph/progress.md`, réaffirmé le 4 septembre 2026.
- **Alternative rejetée** : envoyer également les graines ANCRER par e-mail et WhatsApp, ce qui contredirait l’opt-in borné déjà approuvé et l’ADR-303.
