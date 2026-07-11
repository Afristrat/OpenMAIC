# Checklist RTL — Parcours guidé ar-MA (S0-012)

**Story** : `S0-012` — [CHECKPOINT AMINE] — `.ralph/prd-v2.json`
**Statut** : `passes: false` — reste `false` tant qu'Amine n'a pas rempli ce document et consigné son verdict. Cette checklist n'est **pas** une vérification automatisée ; c'est un guide de parcours visuel humain.

## Objectif

Valider à l'œil, écran par écran, que l'interface Qalem en arabe (`ar-MA`, RTL) est réellement utilisable — pas seulement que `dir="rtl"` est posé sur `<html>` (ça, c'est déjà prouvé automatiquement, voir plus bas). Chaque défaut constaté ici devient une story de pioche chiffrée (backlog), pas un blocage silencieux.

## Ce qui est DÉJÀ couvert par l'automatisation (ne pas re-tester)

Le test e2e `e2e/tests/generation-flow-locale.spec.ts` (gate S0-008, déjà vert) vérifie automatiquement, en `fr-FR` ET en `ar-MA` :
- `<html dir="rtl" lang="ar-MA">` posé sur la page d'accueil ET conservé dans la classroom
- Le flux complet accueil → aperçu de génération → classroom fonctionne sans erreur en `ar-MA`
- Le contenu localisé (titres de scènes en arabe) s'affiche correctement dans la sidebar de la classroom

**Ce que l'automatisation ne peut PAS juger** (raison d'être de cette checklist) : débordement visuel réel, alignement fin, densité du texte arabe qui pousse la mise en page, sens des icônes directionnelles, position miroir des éléments interactifs, lisibilité générale. Un test Playwright vérifie des attributs et du texte, pas si « ça a l'air juste ».

## Constat structurel à vérifier en priorité

Recherche exhaustive dans le code (`grep rtl-flip` sur tous les `.tsx` du repo) : **la classe utilitaire `.rtl-flip` existe dans `app/globals.css` (elle inverse les icônes via `transform: scaleX(-1)` quand `dir="rtl"`) mais n'est appliquée dans AUCUN composant `.tsx` du repo, zéro occurrence.** Concrètement, chaque icône directionnelle (chevron, flèche) listée dans les écrans ci-dessous est *a priori suspecte* — elle pointe probablement encore dans le sens LTR en arabe — jusqu'à preuve visuelle du contraire. Ne pas présumer qu'un écran est correct parce que d'autres le sont : chaque occurrence d'icône directionnelle doit être regardée individuellement.

Exception notable déjà gérée dans le code (à confirmer visuellement, pas juste faire confiance au code) : la barre latérale de navigation (`components/navigation-sidebar.tsx`) recalcule sa position (`right-0`/`left-0`) et le sens du tiroir mobile via une variable `isRtl` — logique différente de `rtl-flip`, donc à vérifier séparément.

## Comment basculer en ar-MA

Le sélecteur de langue est présent sur l'écran d'accueil (`/`) et dans l'en-tête de la classroom (`components/stage/header-controls.tsx`). Il n'est **pas** ré-affiché sur tous les écrans secondaires (paramètres, organisation, admin…) — le choix de langue persiste via `localStorage['locale']` (clé lue par `I18nProvider` au montage). Bascule en `ar-MA` une fois depuis l'accueil ou la classroom, puis navigue vers les autres écrans : la langue doit rester `ar-MA` partout.

## Légende

- Case à cocher = point de contrôle validé (comportement correct observé)
- Champ « Défaut constaté » = à remplir UNIQUEMENT si un problème est observé ; laisser vide sinon. Sois précis (capture d'écran si possible, nom du composant si connu, description du décalage).
- `[P0]` `[P1]` `[P2]` = priorité de l'écran (P0 = parcours critique nommé explicitement par l'acceptance de S0-005 ; P1 = écrans secondaires du parcours utilisateur authentifié ; P2 = pages marketing/légales, moins critiques mais quand même en scope produit FR/AR/EN)

---

## Comment lire cette checklist

Les écrans sont listés selon la structure réelle des routes Next.js App Router (`app/**/page.tsx`) au moment de la rédaction (S0-008 terminé). La **Classroom** (`/classroom/[id]`) est l'écran le plus riche de l'application ; elle est découpée en plusieurs sous-sections (sidebar, scène, chat, table ronde, tableau blanc, barre d'outils d'édition, quiz) car ce sont des zones visuellement et fonctionnellement distinctes que tu regarderas l'une après l'autre.

**Hors périmètre explicite** : `/eval/whiteboard` — outil de développement interne (harness d'évaluation), jamais exposé à un utilisateur final, exclu de cette checklist.

**Écrans nécessitant des données de test** : certains écrans (organisation, marketplace détail, vérification de certificat) nécessitent un identifiant réel (org, agent, code) pour être atteints. Si tu ne peux pas y accéder sans données de test, note-le dans le champ Défaut constaté du premier point de l'écran concerné plutôt que de laisser la section vide — ce sera traité comme un signal, pas ignoré.

---

# P0 — Écrans critiques (parcours principal, nommés par S0-005)

## Écran 1 [P0] — Accueil / Génération — route `/` (`app/page.tsx`)

- [ ] Le texte de la page (titres, placeholder du champ de saisie, libellés de boutons) s'affiche en arabe correctement formé (pas de lettres désolidarisées, pas de mojibake)
      Défaut constaté : ___________________________
- [ ] Le texte est aligné à droite, pas resté à gauche par erreur
      Défaut constaté : ___________________________
- [ ] Le champ de saisie du besoin (textarea) affiche le curseur et le texte tapé de droite à gauche
      Défaut constaté : ___________________________
- [ ] Le bouton d'envoi (icône `ArrowUp`) est à la position miroir attendue (généralement à gauche du champ en RTL, pas restée à droite comme en LTR)
      Défaut constaté : ___________________________
- [ ] Les menus déroulants (historique, réglages — icônes `ChevronDown`/`ChevronUp`) s'ouvrent et se ferment sans être coupés par le bord de l'écran
      Défaut constaté : ___________________________
- [ ] Le sélecteur de langue (`LanguageSwitcher`) reste lisible et cliquable, sans chevauchement avec d'autres éléments de la barre
      Défaut constaté : ___________________________
- [ ] La barre d'outils de génération (`GenerationToolbar`) et la barre d'agents (`AgentBar`) restent lisibles, aucun libellé arabe tronqué ou qui pousse un bouton hors cadre
      Défaut constaté : ___________________________

## Écran 2 [P0] — Accueil / Génération — route `/app` (`app/app/page.tsx`, formulaire quasi dupliqué)

**Note** : ce second formulaire de génération existe en parallèle de l'écran 1 (divergence de routage documentée dans le rapport S0-008, non tranchée — candidate à S0-011). Vérifie-le quand même intégralement : c'est un écran réel, potentiellement celui qui sera gardé.

- [ ] Mêmes points que l'écran 1 : texte arabe bien formé et aligné à droite
      Défaut constaté : ___________________________
- [ ] Liste des sessions/stages précédents (`StageListItem`, miniatures `ThumbnailSlide`) : la carte et ses actions (icônes `Copy`, `Pencil`, `Trash2`) sont en position miroir cohérente
      Défaut constaté : ___________________________
- [ ] Menus déroulants `ChevronDown`/`ChevronUp` fonctionnels sans coupure visuelle
      Défaut constaté : ___________________________

## Écran 3 [P0] — Aperçu de génération — `/generation-preview`

- [ ] Le titre d'étape et le texte de progression s'affichent en arabe, alignés à droite
      Défaut constaté : ___________________________
- [ ] Les indicateurs de progression / visualiseurs (`app/generation-preview/components/visualizers.tsx`) restent cohérents visuellement (pas de sens de progression qui semble inversé ou incohérent avec le RTL)
      Défaut constaté : ___________________________
- [ ] Aucun texte arabe tronqué pendant l'affichage des étapes qui s'enchaînent (le texte AR est souvent plus long qu'en FR/EN — vérifier que rien n'est coupé par un conteneur à largeur fixe)
      Défaut constaté : ___________________________

## Écran 4 [P0] — Classroom — vue d'ensemble & sidebar des scènes — `/classroom/[id]`

- [ ] La sidebar des scènes s'affiche du bon côté de l'écran en RTL (à droite, pas restée à gauche)
      Défaut constaté : ___________________________
- [ ] Les titres de scènes en arabe (déjà vérifiés par e2e pour le CONTENU) sont lisibles sans troncature ni retour à la ligne cassé au milieu d'un mot
      Défaut constaté : ___________________________
- [ ] L'ordre visuel des scènes dans la liste reste cohérent (haut → bas, pas d'inversion inattendue liée au RTL)
      Défaut constaté : ___________________________
- [ ] Les icônes d'état/action sur chaque item de scène sont à la position miroir attendue
      Défaut constaté : ___________________________
- [ ] Le bouton retour dans l'en-tête (`components/header.tsx`, icône `ArrowLeft`) : vérifier s'il pointe visuellement dans le sens de sortie cohérent en RTL (candidat identifié comme suspect — `rtl-flip` non appliqué dans ce fichier)
      Défaut constaté : ___________________________

## Écran 5 [P0] — Classroom — scène / stage (slide-renderer)

- [ ] Le texte des diapositives en arabe est rendu net et bien formé (pas de lettres coupées par le moteur de rendu)
      Défaut constaté : ___________________________
- [ ] L'alignement du texte dans les blocs de la diapositive respecte le RTL (sauf exception volontaire du contenu généré)
      Défaut constaté : ___________________________
- [ ] Les formules mathématiques (KaTeX/Temml) et le contenu numérique restent en LTR *au sein* du flux RTL, sans casser la mise en page environnante (comportement normal attendu — noter uniquement si ça déborde ou chevauche du texte arabe)
      Défaut constaté : ___________________________
- [ ] Les graphiques ECharts : légendes et libellés arabes lisibles, non tronqués, axes cohérents
      Défaut constaté : ___________________________
- [ ] Aucun élément de diapositive (image, forme, zone de texte) ne déborde du canevas visible à cause de la longueur du texte arabe
      Défaut constaté : ___________________________

## Écran 6 [P0] — Classroom — panneau de chat

- [ ] Les bulles de message s'alignent du bon côté (agent vs utilisateur) et restent cohérentes en RTL
      Défaut constaté : ___________________________
- [ ] Le texte arabe dans les bulles est bien formé, sans troncature, retour à la ligne correct
      Défaut constaté : ___________________________
- [ ] Le champ de saisie du chat affiche le texte tapé de droite à gauche, curseur inclus
      Défaut constaté : ___________________________
- [ ] Icônes de citation/référence (`components/ai-elements/inline-citation.tsx`, `message.tsx` — `Chevron`/`Arrow`) : position et sens cohérents
      Défaut constaté : ___________________________
- [ ] L'horodatage et l'avatar des messages restent à une position lisible, pas de chevauchement avec le texte
      Défaut constaté : ___________________________

## Écran 7 [P0] — Classroom — table ronde multi-agents (roundtable)

- [ ] Disposition des participants (agents/élèves) cohérente visuellement en RTL, pas de superposition
      Défaut constaté : ___________________________
- [ ] Noms et bulles de texte des agents en arabe bien formés et alignés à droite
      Défaut constaté : ___________________________
- [ ] Navigation/pagination de la table ronde (`components/roundtable/index.tsx`, icônes `ChevronLeft`/`ChevronRight` lignes ~1797/~1946) : vérifier si le sens précédent/suivant est cohérent avec le RTL (candidat identifié comme suspect — `rtl-flip` non appliqué dans ce fichier)
      Défaut constaté : ___________________________

## Écran 8 [P0] — Classroom — tableau blanc (whiteboard)

- [ ] La barre d'outils de dessin reste utilisable, icônes non chevauchées par du texte arabe environnant
      Défaut constaté : ___________________________
- [ ] Les contrôles de zoom/navigation du canevas (`components/canvas/canvas-toolbar.tsx`, icônes `ChevronLeft`/`ChevronRight` lignes ~288/~344) : vérifier le sens visuel en RTL (candidat identifié comme suspect — `rtl-flip` non appliqué dans ce fichier)
      Défaut constaté : ___________________________
- [ ] Les libellés/tooltips d'outils en arabe restent lisibles et non tronqués
      Défaut constaté : ___________________________
- [ ] Le tableau blanc lui-même (zone de dessin libre) : confirmer qu'aucune UI de contrôle ne se superpose à la zone de dessin en RTL
      Défaut constaté : ___________________________

## Écran 9 [P0] — Classroom — barre d'outils d'édition (mode Pro : ActionsBar / CommandBar)

- [ ] `components/edit/ActionsBar/ActionsBar.tsx` : icônes directionnelles cohérentes, boutons non tronqués par des libellés arabes plus longs
      Défaut constaté : ___________________________
- [ ] `components/edit/EditShell/CommandBar.tsx` : la barre de commandes reste utilisable, pas de bouton qui sort du cadre visible
      Défaut constaté : ___________________________
- [ ] `components/edit/PlaybackChromeRoot.tsx` : contrôles de lecture (play/pause/suivant/précédent) — sens cohérent avec le RTL
      Défaut constaté : ___________________________
- [ ] Panneau de raisonnement de l'agent (`components/edit/AgentPanel/reasoning-part.tsx`) : texte et icônes d'expansion cohérents en RTL
      Défaut constaté : ___________________________

## Écran 10 [P0] — Classroom — scène quiz

- [ ] `components/scene-renderers/quiz-view.tsx` : le bouton « question suivante » (icône `ChevronRight`, ligne ~175) — vérifier le sens visuel en RTL (candidat identifié comme suspect — `rtl-flip` non appliqué dans ce fichier)
      Défaut constaté : ___________________________
- [ ] Les options de réponse en arabe sont alignées à droite, lisibles intégralement
      Défaut constaté : ___________________________
- [ ] `components/edit/surfaces/quiz/QuestionCard.tsx` : mise en page de la carte de question cohérente en RTL
      Défaut constaté : ___________________________
- [ ] Indicateur de progression du quiz (X / N questions) cohérent visuellement, pas inversé de façon déroutante
      Défaut constaté : ___________________________

## Écran 11 [P0] — Paramètres — `/settings`

- [ ] Tous les libellés de réglages en arabe, alignés à droite, non tronqués
      Défaut constaté : ___________________________
- [ ] Les champs de saisie (clés API, URLs de providers) restent lisibles malgré direction RTL (contenu technique souvent LTR — vérifier qu'il ne casse pas la mise en page)
      Défaut constaté : ___________________________
- [ ] Interrupteurs/toggles à la position miroir attendue par rapport à leur libellé
      Défaut constaté : ___________________________
- [ ] Sections repliables/dépliables : icônes d'expansion cohérentes en sens RTL
      Défaut constaté : ___________________________
- [ ] Aucun débordement horizontal (scroll latéral inattendu) causé par le texte arabe
      Défaut constaté : ___________________________

---

# P1 — Écrans secondaires du parcours utilisateur

## Écran 12 [P1] — Navigation globale — barre latérale (`components/navigation-sidebar.tsx`)

- [ ] La sidebar s'affiche bien à droite en RTL (le code recalcule `right-0`/`left-0` via `isRtl` — confirmer visuellement que ce n'est pas juste correct en théorie)
      Défaut constaté : ___________________________
- [ ] Le bouton replier/déplier (icônes `PanelLeft`/`PanelLeftClose`, ligne ~271) pointe dans un sens qui reste intuitif une fois la sidebar à droite — ces icônes ne changent PAS de sens en RTL (pas de `rtl-flip`), donc « replier vers la droite » pourrait sembler illogique visuellement
      Défaut constaté : ___________________________
- [ ] Le tiroir mobile (drawer) s'ouvre et se ferme du bon côté sur petit écran
      Défaut constaté : ___________________________
- [ ] Tous les libellés de menu (Accueil, Cours, Marketplace, Certificats, Paramètres, etc.) en arabe, non tronqués même sur sidebar réduite
      Défaut constaté : ___________________________
- [ ] Le texte est bien aligné à droite dans tout le panneau (`isRtl && 'text-right'`)
      Défaut constaté : ___________________________

## Écran 13 [P1] — En-tête global (`components/header.tsx`)

- [ ] Le bouton retour (icône `ArrowLeft`, ligne ~29) — vérifier le sens visuel en RTL (candidat identifié comme suspect — `rtl-flip` non appliqué dans ce fichier)
      Défaut constaté : ___________________________
- [ ] Titre de page et actions de l'en-tête alignés à droite, sans chevauchement
      Défaut constaté : ___________________________

## Écran 14 [P1] — Profil — `/profile`

- [ ] Champs de formulaire (nom, préférences) alignés à droite, texte arabe bien formé
      Défaut constaté : ___________________________
- [ ] Sélecteur d'avatar et boutons d'action à la position miroir cohérente
      Défaut constaté : ___________________________
- [ ] Aucune troncature de libellé de champ en arabe
      Défaut constaté : ___________________________

## Écran 15 [P1] — Authentification — `/auth`

- [ ] Formulaire de connexion/inscription : champs et libellés alignés à droite
      Défaut constaté : ___________________________
- [ ] Messages d'erreur de validation en arabe, lisibles et bien positionnés par rapport au champ concerné
      Défaut constaté : ___________________________
- [ ] Boutons d'action (connexion, bascule connexion/inscription) à la position miroir attendue
      Défaut constaté : ___________________________

## Écran 16 [P1] — Certificats — `/certificates` + vérification `/verify/[code]` et `/certificates/verify/[code]`

- [ ] Liste des certificats : texte arabe (titre du cours, date) bien aligné, non tronqué
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles repérées par grep sur `app/certificates/page.tsx` : sens cohérent en RTL
      Défaut constaté : ___________________________
- [ ] Page de vérification de certificat (`/verify/[code]`) : mise en page cohérente en arabe, badge de statut (valide/invalide) lisible
      Défaut constaté : ___________________________

## Écran 17 [P1] — Marketplace des agents — `/marketplace/agents` + `/marketplace/agents/[agentId]`

- [ ] Liste des agents : cartes alignées à droite, texte de description arabe non tronqué
      Défaut constaté : ___________________________
- [ ] Fiche détail d'un agent : mise en page cohérente, icônes directionnelles (repérées par grep sur les deux fichiers `page.tsx`) au bon sens
      Défaut constaté : ___________________________
- [ ] Boutons d'action (installer/utiliser l'agent) à la position miroir attendue
      Défaut constaté : ___________________________

## Écran 18 [P1] — Organisation — administration — `/org/[orgId]/admin`

- [ ] Tableaux/listes de membres alignés à droite, colonnes dans un ordre cohérent en RTL
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles (repérées par grep) au bon sens
      Défaut constaté : ___________________________
- [ ] Formulaires d'invitation/gestion : champs et boutons en position miroir cohérente
      Défaut constaté : ___________________________

## Écran 19 [P1] — Organisation — curriculum — `/org/[orgId]/curriculum`

- [ ] Structure du curriculum (arborescence/liste de cours) lisible et cohérente en RTL
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles (repérées par grep) au bon sens
      Défaut constaté : ___________________________

## Écran 20 [P1] — Organisation — bibliothèque — `/org/[orgId]/library`

- [ ] Grille/liste de ressources alignée à droite, texte arabe non tronqué
      Défaut constaté : ___________________________
- [ ] Filtres et barre de recherche cohérents en RTL (placeholder, icône de recherche à la bonne position)
      Défaut constaté : ___________________________

## Écran 21 [P1] — Organisation — rapports — `/org/[orgId]/reports`

- [ ] Graphiques/statistiques : légendes arabes lisibles, non tronquées
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles (repérées par grep) au bon sens
      Défaut constaté : ___________________________
- [ ] Tableaux de données : alignement des colonnes cohérent en RTL
      Défaut constaté : ___________________________

## Écran 22 [P1] — Administration globale — `/admin`

- [ ] Listes/tableaux d'administration alignés à droite
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles (repérées par grep) au bon sens
      Défaut constaté : ___________________________

## Écran 23 [P1] — Paiement — `/pay` + `/pay/success`

- [ ] Formulaire de paiement : champs et libellés alignés à droite, montants/devises restent lisibles (LTR au sein du flux RTL, comportement normal attendu)
      Défaut constaté : ___________________________
- [ ] Page de confirmation (`/pay/success`) : message et icône de succès bien positionnés
      Défaut constaté : ___________________________

## Écran 24 [P1] — Tarification — `/pricing`

- [ ] Grille de tarifs alignée à droite, cartes de plans dans un ordre cohérent
      Défaut constaté : ___________________________
- [ ] Prix et devises restent lisibles sans casser l'alignement du texte arabe environnant
      Défaut constaté : ___________________________

---

# P2 — Écrans marketing / légaux / secondaires

## Écran 25 [P2] — Vitrine fonctionnalités — `/features`

- [ ] Texte marketing en arabe bien formé, aligné à droite
      Défaut constaté : ___________________________
- [ ] Aucun débordement de texte hors des cartes/sections
      Défaut constaté : ___________________________
- [ ] Icônes illustratives cohérentes (pas nécessairement directionnelles, mais vérifier si certaines le sont)
      Défaut constaté : ___________________________

## Écran 26 [P2] — Institutions — `/institutions`

- [ ] Texte en arabe bien formé, aligné à droite, non tronqué
      Défaut constaté : ___________________________
- [ ] Mise en page générale cohérente (pas de section qui reste visuellement LTR par oubli)
      Défaut constaté : ___________________________

## Écran 27 [P2] — Mentions légales — `/legal/privacy` et `/legal/terms`

- [ ] Texte long en arabe : lisible, correctement justifié/aligné à droite, pas de débordement de paragraphe
      Défaut constaté : ___________________________
- [ ] Navigation dans le layout légal (`app/legal/layout.tsx`, icônes directionnelles repérées par grep) au bon sens
      Défaut constaté : ___________________________

## Écran 28 [P2] — Plugins — `/plugins`

- [ ] Liste/grille de plugins alignée à droite, texte non tronqué
      Défaut constaté : ___________________________
- [ ] Boutons d'action à la position miroir attendue
      Défaut constaté : ___________________________

## Écran 29 [P2] — Compétences (Skills) — `/skills`

- [ ] Liste des compétences alignée à droite, texte arabe non tronqué
      Défaut constaté : ___________________________
- [ ] Mise en page cohérente sans élément resté LTR par oubli
      Défaut constaté : ___________________________

## Écran 30 [P2] — Revue — `/review`

- [ ] Contenu de la page aligné à droite
      Défaut constaté : ___________________________
- [ ] Icônes directionnelles (repérées par grep sur `app/review/page.tsx`) au bon sens
      Défaut constaté : ___________________________

---

# Verdict d'Amine (obligatoire pour clore S0-012)

**Ce document ne ferme pas la story tant que cette section n'est pas remplie.**

- Date du parcours : ___________________________
- Nombre d'écrans réellement parcourus sur 30 : _____
- Verdict global (RTL utilisable en l'état / RTL nécessite des corrections avant bascule prod) : ___________________________

## Tableau des défauts constatés → stories de pioche

| # | Écran | Défaut constaté | Sévérité (bloquant/gênant/cosmétique) | Story de pioche créée (ID) |
|---|--------|------------------|----------------------------------------|------------------------------|
|   |        |                  |                                         |                              |
|   |        |                  |                                         |                              |
|   |        |                  |                                         |                              |

*(ajouter des lignes selon le nombre de défauts constatés)*

**Rappel** : chaque ligne de ce tableau doit se traduire par une story créée dans `.ralph/prd-v2.json` (chantier 0-SOCLE ou pioche dédiée), pas rester un simple constat non actionné.
