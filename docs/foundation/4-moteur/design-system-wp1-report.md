# Rapport WP1 — Directive de design au plan

Date : 2026-10-09
Branche : `feature/adaptive-design-system`
Base : `refork-v030` à `b416c7f162457fe8938c8deebf25882924746621`
SHA validé et poussé : `2be4324ad500b383906e7b307d680b275e51badf`

## Résultat

WP1 est implémenté derrière le réglage par organisation
`settings.features.design_system_v1 === true`. L’absence du réglage laisse le
comportement actuel actif. Les anciens plans sans directive restent acceptés ;
pour un tenant explicitement activé, un plan nouveau ou approuvé sans directive
reçoit le repli neutre.

- Contrat DSL et schéma strict, enums fermées, police autorisée, valeurs bornées
  et normalisation à 1 000 caractères :
  `packages/@openmaic/dsl/src/design.ts:1`,
  `lib/branding/design-directive.ts:15`.
- Plan de génération conditionnel, avec exemples de sécurité industrielle,
  finance et compétences relationnelles ; l’ancien format tableau est conservé :
  `lib/prompts/templates/requirements-to-outlines/user.md:71`,
  `lib/generation/outline-generator.ts:337`.
- Directive attachée au stage et restaurée depuis `stages.extra` ainsi que le
  stockage IndexedDB : `lib/server/classroom-storage.ts:80`,
  `lib/utils/stage-storage.ts:74`.
- Régénération réutilisant le même objet enregistré :
  `lib/agent/client/use-agent-runtime.ts:338`,
  `lib/agent/tools/regenerate-scene.ts:181`.
- Palette calculée en code, incluant le thème neutre Inter ; les valeurs de
  palette sont transmises au prompt de slide, jamais rédigées en hexadécimal par
  le modèle : `lib/branding/design-directive.ts:171`,
  `lib/branding/design-directive.ts:215`,
  `lib/generation/scene-generator.ts:1230`.
- Thème neuf appliqué uniquement quand le tenant a activé le flag ; thème
  historique préservé lorsque le flag est absent ou désactivé :
  `lib/server/classroom-generation.ts:963`.

## Vérifications

Toutes les commandes ont été exécutées dans le conteneur de validation de
ServeurIA sur un clone temporaire propre au SHA ci-dessus. Le clone Qalem partagé
de ServeurIA, qui contient des changements préexistants, n’a pas été modifié.

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | Réussi |
| `pnpm lint` | Réussi |
| Tests ciblés WP1 et persistance | 25/25 réussis |
| `pnpm test` | 554 fichiers, 3 431 tests réussis |
| `pnpm test:e2e` | 202/202 réussis, code de sortie 0 |
| `pnpm build` | Réussi ; routes isolées vérifiées |
| `git diff --check` | Réussi |
| PRD / `main` | Aucun changement |
| Génération réelle / quotas / Coolify | Non lancés |

## Écarts et limites à conserver

1. La palette est dérivée par code avec `tinycolor2` en HSL, puis ses rôles de
   texte sont ajustés par contraste WCAG. Les 10 familles de teinte et deux
   niveaux de chroma ont passé les tests ≥ 4,5:1. Ce n’est pas une conversion
   OKLCH ; la méthode OKLCH du §4.3 du brief reste à calibrer avant d’en faire
   une garantie perceptuelle.
2. Le réglage technique existe dans les paramètres d’organisation, mais aucun
   écran d’administration ne l’expose. L’activation opérationnelle relève du
   WP9 ; rien n’a été activé sur un tenant de production.
3. La charte tenant n’est pas encore attachée à la directive. Le WP2 doit créer
   et persister son instantané ; jusque-là, les couleurs sont dérivées de la
   directive seule.
4. La cohérence a été vérifiée par tests et par code. Aucune validation visuelle
   de slides générées n’a été faite, conformément à l’interdiction de génération
   réelle sans tenant isolé et autorisation de quotas.

## Commits

- `940ce642` — `WP1: persist adaptive design directive`
- `5e3a7f72` — `WP1: tighten directive schema types`
- `858c4c99` — `WP1: derive dark card token directly`
- `f90c4247` — `WP1: keep adjusted dark text token`
- `cdde3b14` — `WP1: test accessible palette hue families`
- `c993cbd2` — `WP1: apply neutral slide theme to opted-in plans`
- `2be4324a` — `WP1: avoid warning on default directive fallback`

Prochaine étape du brief : WP2, instantané de charte tenant. WP0 reste ouvert
pour les mesures runtime et les preuves d’export, sans empêcher ce WP1.
