# S6-024 — Tarification à la valeur et pilotage de la marge

Date de certification : 2026-09-01

## Résultat livré

Le prix vendu est une décision commerciale explicite, versionnée par tenant, devise, unité facturable et date d’effet. Le coût fournisseur est enregistré dans un référentiel distinct. Aucun coût, multiplicateur, objectif de marge ou calcul analytique ne peut écrire ou recalculer un prix vendu.

Les unités couvertes sont les jetons LLM entrants et sortants, les secondes de synthèse vocale et de transcription, les images, les secondes de vidéo, les octets stockés et les opérations. Les coûts réels ou estimés portent leur fournisseur, modèle, devise, provenance et période. Les conversions utilisent exclusivement un taux FX versionné et audité.

Chaque débit facturable et sa valorisation sont exécutés dans une même transaction PostgreSQL. La valorisation conserve les identifiants des versions de prix, coût et taux FX ainsi que les montants arrondis en millionièmes entiers. Les snapshots sont immuables. Les synthèses exposent chiffre d’affaires, coût, marge brute et taux de marge par tenant, unité et période ; la consolidation est pondérée par le chiffre d’affaires. La cible est configurable et vaut 95 % par défaut.

Une marge sous la cible ne produit qu’une alerte diagnostique. Elle ne modifie ni prix, ni crédits, ni sièges, ni droits.

## Preuves permanentes

- Migration : `supabase/migrations/00055_value_pricing_and_margin.sql`.
- Recette rejouable : `scripts/validation/s6-024-value-pricing-smoke.sql`.
- Services serveur : `lib/billing/value-pricing.ts`.
- API super-administrateur : `app/api/admin/economics/route.ts` et `app/api/admin/tenants/[tenantId]/economics/route.ts`.
- Interface FR/EN/AR et RTL : `components/admin/economics-panel.tsx`.
- Tests permanents : `tests/supabase/value-pricing-migration.test.ts`, `tests/billing/value-pricing.test.ts`, `tests/api/admin-economics.test.ts` et `e2e/tests/admin-tenants.spec.ts`.

## Recette de production

La migration `00055` a été appliquée à la base Qalem. La recette transactionnelle réelle a ensuite vérifié :

- un prix commercial explicite de 100 MAD par opération ;
- un coût fournisseur indépendant de 10 MAD ;
- un débit et une valorisation atomiques donnant 100 MAD de chiffre d’affaires, 10 MAD de coût, 90 MAD de marge brute et 90 % de taux de marge ;
- l’alerte sous la cible par défaut de 95 % ;
- la conservation du snapshot après création d’une nouvelle version du prix ;
- une conversion USD→MAD par taux daté et sourcé ;
- le rejet des périodes de prix, coût et FX qui se chevauchent ;
- l’immutabilité et l’isolation RLS ;
- la révocation des tables et RPC économiques aux rôles navigateur.

La transaction a été annulée. Les contrôles finaux `schema_present`, `default_target_is_95_percent`, `browser_table_access_revoked`, `browser_rpc_access_revoked`, `no_temporary_tenant`, `no_temporary_cost` et `no_temporary_fx` valent tous `true`.

## Déploiement et gate exact

- SHA fonctionnel : `ea301224966b0f5d0be3f0f7f5b79634419a0707` sur `origin/refork-v030`.
- Déploiement Coolify : `z9v96w1wpz2y8074bjvqm3qr`, terminé sur ce SHA.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-164243671478`, sain, zéro redémarrage, `OOMKilled=false`.
- Vérifications internes : `/` = 200, `/api/health` = 200, `/api/admin/economics` anonyme = 401.
- Gate ServeurIA : formatage, TypeScript et lint verts ; 398/398 fichiers et 2 553/2 553 tests Vitest ; build de 103 pages ; 89/89 tests Playwright en 3,8 minutes.
- Journal : `/tmp/qalem-gate-logs/s6024-ea30122-full-gate.log` ; SHA-256 `9e3b81bae9d903d75b15de38a93f3b7bd99ecce0a5ff1a3c79ba75a155564996`.

Les occurrences « error », « failed » et « failure » du journal appartiennent aux intitulés et fixtures de chemins d’erreur attendus ; toutes les suites sont vertes. Les avis Sentry du build sont les messages d’information de télémétrie déjà connus, sans échec ni avertissement nouveau.
