# S4-010 — Recertification du contexte territorial et du guidage laser

Date : 2026-09-03

Branche : `refork-v030`

SHA fonctionnel certifié : `df6023a879d76eb6468ff317b1cff26027702b93`

## Contrat recertifié

L’auteur choisit explicitement un territoire et une devise reconnue par le registre ISO 4217 du runtime. Les trames Formation Design Pro transmettent ce contexte sous forme structurée, le formulaire peut le remplacer avant génération et la classroom persiste l’instantané final. La directive commune impose ensuite la devise choisie à tous les montants, budgets, exemples et exercices, sans conversion non sourcée.

Le guidage laser mesure l’union de la boîte DOM réellement positionnée et de son contenu rendu. Il parcourt toute cette zone selon un mouvement en serpentin et respecte la durée normalisée de l’action.

## Preuves ciblées sur ServeurIA

Neuf fichiers et 40/40 tests Vitest réussis couvrent :

- la normalisation du territoire et de la devise, le refus de `ZZZ` et l’acceptation de `XOF` ;
- les six trames système et leur contexte structuré Maroc/MAD ;
- le passage API, la persistance dans la classroom et la mise à jour du Stage sans perte de scènes ;
- les durées et le parcours du laser ;
- la publication Formation Design Pro v3.8.0 et le recalcul de chaque empreinte SHA-256 déclarée.

Le parcours Chromium Formation Design Pro prouve le contexte Maroc/MAD d’une trame, son remplacement explicite par Sénégal/XOF et la réception exacte de cet instantané par le job persistant. Le second parcours mesure la géométrie DOM complète de la cible laser, constate le déplacement du pointeur et vérifie une durée de 2 500 ms. Les 2/2 tests passent.

Le conteneur ciblé est sorti avec le code 0 et `OOMKilled=false`. Journaux SHA-256 :

- Vitest : `90f91dc1a5562cb7493221a5372c49e0b2797b548dfe03c61d79d4664d92e9f4` ;
- Chromium : `d903bfa37a353e03cf48b583ced7f966fecb9e48ee63d17eb9a544e79ca10c5d`.

Artefacts permanents : `C:/Users/amans/.codex/visualizations/2026/08/15/01a005ad-360e-7710-aeb5-bf5fc84c67b6/s4-010/`.

## Gate complet

Le gate complet frais du SHA `df6023a879d76eb6468ff317b1cff26027702b93` couvre le même arbre fonctionnel : le diff vers le SHA documentaire suivant est vide sur `app/`, `components/`, `lib/`, `tests/`, `e2e/`, `supabase/`, `package.json` et `pnpm-lock.yaml`.

- audit de production : aucune vulnérabilité connue ;
- Prettier, TypeScript et ESLint : verts ;
- Vitest : 420/420 fichiers et 2 641/2 641 tests ;
- build Next.js : 151 routes ;
- Playwright Chromium : 105/105.

Le conteneur du gate est sorti avec le code 0 et `OOMKilled=false`. Journal SHA-256 : `201093cb6c5389a1cd02072d0fe3224804590cd02ea1330deaff037b043b7509`.
