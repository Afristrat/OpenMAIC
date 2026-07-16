# Capacité "capture web" — illustrer une formation avec des captures d'un outil tiers

Date : 2026-07-16
Statut : validé par Amine (design), en attente d'implémentation

## Contexte

Qalem génère des formations sur des sujets techniques (ex. « LiteLLM en production »). Quand le sujet est un outil/produit réel (LiteLLM, un SaaS, une plateforme), la formation gagne à illustrer des scènes avec de vraies captures de cet outil — statiques ou animées (scroll, zoom, clic simulé) — plutôt que des slides purement textuelles.

Origine concrète : le cours `F6G9W_LPT8` (« LiteLLM en production ») devrait illustrer des scènes avec des captures de l'admin LiteLLM déployé par Amine (`proxy.ai-mpower.com`).

## Décision de portée

Capacité **produit réutilisable**, intégrée au pipeline de génération — pas un script ponctuel pour ce seul cours. N'importe quelle formation future sur un outil réel peut en bénéficier.

## Architecture retenue

**Service de capture Playwright dédié**, dans un conteneur séparé sur serveuria (Playwright + Chromium — même image de base que `qalem-refork-exec`), exécuté en job asynchrone (même mécanisme que l'export SCORM, `lib/jobs/workers.ts`) — pas embarqué dans l'app principale.

Raison : Chromium headless est lourd (~300-500 Mo) et une source d'instabilité mémoire potentielle. L'isoler dans son propre conteneur évite d'alourdir/fragiliser l'image de prod principale et suit le pattern déjà établi de conteneurs dédiés par fonction.

Alternative écartée : Playwright embarqué directement dans l'app principale — plus simple à opérer (rien de nouveau à déployer) mais couple la stabilité du service Next.js de prod à celle d'un navigateur headless.

## Déclencheur et décision

- **Automatique, pendant la génération de l'outline** (`outline-generator.ts`) : pour chaque scène, un nouvel appel LLM `scene-web-capture-plan` (même famille que `scene-content`/`scene-actions`) décide :
  - `needsCapture: boolean`
  - `url` — **déduite par l'IA depuis le sujet de la formation**, aucun catalogue fourni par l'utilisateur
  - `interactionSteps[]` — clics/scrolls à simuler
  - `format: 'image' | 'video'` — décidé au cas par cas par l'IA (image pour montrer un écran, vidéo courte pour montrer un parcours)
- La capture s'exécute **avant** `generateSceneContent` pour cette scène (synchrone dans l'ordre du pipeline, pas en parallèle) : le LLM de contenu de la scène a besoin de connaître l'image/vidéo pour composer la slide autour — même logique que `assignedImages` pour les PDF importés.

## Garde-fou de sécurité — obligatoire

L'URL déduite par l'IA passe par `lib/server/ssrf-guard.ts` (déjà existant, déjà branché sur les autres fetchs sortants du produit — image/vidéo/PDF providers, proxy-media) **avant toute tentative de capture**. Une IA qui déduit seule une URL est une surface SSRF réelle ; aucune exception pour ce nouveau chemin.

## Authentification

Registre `{domaine → chemin storageState Playwright}`, alimenté **manuellement par Amine, une fois par outil externe** (il se connecte lui-même dans une session Playwright non-headless une seule fois, l'état de session est sauvegardé et réutilisé automatiquement ensuite pour toutes les générations futures touchant ce domaine).

Contrainte non négociable : Claude/le pipeline ne saisit jamais un mot de passe/clé API dans un formulaire de connexion. Si un domaine n'a pas de `storageState` enregistré et que la page capturée s'avère nécessiter une connexion, c'est traité comme un échec de capture (voir plus bas) — jamais de tentative de contournement.

## Gestion d'échec

Une capture ratée (page injoignable, timeout, sélecteur introuvable, mur de connexion détecté après coup, rejet `ssrf-guard`) **ne bloque jamais la génération du cours** : la scène concernée se génère sans le média capturé, l'échec est journalisé pour revue manuelle après coup. Même politique que l'isolation de panne déjà en place pour le contenu/les actions/le TTS (`use-scene-generator.ts`, fix de la session du 2026-07-15) — jamais de branche `break` qui arrête tout le batch pour un échec isolé.

Détection heuristique de mur de connexion : titre de page contenant "login"/"sign in", ou statut HTTP 401/403 sur la navigation initiale.

## Flux de données

```
outline-generator.ts
  → pour chaque scène outline : appel LLM "scene-web-capture-plan"
    → { needsCapture, url, interactionSteps[], format, reason }
  → si needsCapture : url passée à ssrf-guard.ts (rejet → needsCapture=false, log)
  → job créé (lib/jobs/workers.ts) : { url, interactionSteps, format, storageStateRef? }

Service de capture (nouveau conteneur, Playwright+Chromium)
  → résout storageStateRef via le registre {domaine → storageState} si applicable
  → Playwright : goto(url) → exécute interactionSteps → screenshot() ou recordVideo()
  → upload vers Supabase Storage (même bucket/pattern que les autres médias de classroom)
  → retourne { assetUrl, format } au job

generateSceneContent / generateSceneActions
  → asset injecté via buildImageResources (image) ou le canal vidéo existant (Hyperframes)
  → le LLM de contenu de scène compose la slide autour de la référence img_N / video_N
```

## Intégration au canal de médias existant

Aucun nouveau type de ressource : l'asset capturé rejoint `assignedImages`/`imageMapping` (`lib/agent/tools/regenerate-scene.ts`) pour les images, et le canal vidéo existant (Hyperframes) pour les vidéos.

## Tests

- Unitaire : `scene-web-capture-plan` (LLM mocké) — schéma de sortie respecté, `ssrf-guard` appelé avant toute capture.
- Unitaire : service de capture — Playwright mocké, résolution correcte du `storageState`, exécution des `interactionSteps`, upload Storage.
- E2E : simulation d'un échec de capture (URL injoignable) → la scène se génère quand même sans média (non-régression sur l'isolation de panne).
- Aucun test ne dépend d'un vrai site tiers en ligne (flaky par nature) — tout est mocké.

## Hors scope (explicitement écarté ce cadrage)

- Catalogue d'URLs fourni manuellement par l'utilisateur — écarté au profit de la déduction IA.
- Capture systématique "toujours statique d'abord" — écartée, l'IA décide du format au cas par cas dès le départ.
- Blocage de la génération complète sur échec de capture — écarté au profit de la continuation silencieuse + log.

## Lien avec le cours F6G9W_LPT8

Cette capacité, une fois implémentée, sera utilisée pour une **régénération unique** du cours `F6G9W_LPT8` (« LiteLLM en production »), bundlée avec le fix de prononciation TTS (chantier séparé, cf. investigation Higgs `language` param) — décision d'Amine de ne pas patcher scène par scène avant que les deux fixes soient prêts.
