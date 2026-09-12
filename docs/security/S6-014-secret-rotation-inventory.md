# S6-014 — Inventaire de rotation Qalem sans valeurs

Date : 12 septembre 2026
Statut : inventaire versionné et rotations partielles préparées ; les webhooks, le jeton capture, LTI, VAPID, le chiffrement LRS et la pseudonymisation xAPI ont été remplacés en configuration persistante le 12 septembre 2026. Aucun de ces remplacements n’est effectif avant redéploiement coordonné ; les clés fournisseurs restent ouvertes.

## Méthode et limite

L’inventaire initial provient exclusivement des noms de variables déclarés dans
`.env.example` et de leurs consommateurs versionnés. Les contrôles ultérieurs
de rotation se limitent à des métadonnées de lignes et d’enveloppes chiffrées.
Aucune valeur, endpoint privé, fichier d’environnement ou coffre n’a été lu.
La présence d’un nom ne prouve pas qu’il est configuré ou utilisé en production.
Une clé déclarée mais non injectée ne doit pas être rotatée inutilement.

Le broker et l’index DPAPI référencés par une ancienne passation étaient absents
du poste au contrôle : `C:\Users\amans\.codex\scripts\invoke-secret.ps1`,
`add-secret.ps1` et `secrets.index` n’existent pas. Cette absence interdit
une rotation sûre ; elle n’autorise ni lecture directe de fichiers de secrets,
ni substitution manuelle de valeurs.

## Catégories et consommateurs Qalem

| Catégorie | Noms concernés, sans valeur | Consommateurs principaux | Vérification avant révocation |
|---|---|---|---|
| Supabase privilège serveur | `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/service.ts`, facturation, collecte, usage, scripts de preuve | Créer la nouvelle clé, l’injecter dans web/worker/scripts Qalem, vérifier santé, auth serveur, RLS et traitement asynchrone ; révoquer l’ancienne seulement après stabilisation. |
| Auth publique et origine | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL` | clients Supabase, cookies SSR, URL de rappel, routes d’origine | Ces valeurs peuvent être publiques/configuration plutôt que secrets. Vérifier domaine HTTPS, cookies et invitations ; ne pas les qualifier de secrets ni les « rotater » sans raison. |
| Web Push | `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_SUBJECT` | `lib/server/web-push.ts`, worker d’ancrage | Déployer la paire cohérente dans web et worker ; les abonnements existants peuvent devenir invalides : planifier réabonnement et recette iOS/Android avant révocation. |
| Rappels | `RESEND_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` | `lib/server/review-notifications.ts` | Vérifier domaine expéditeur, envoi e-mail, état Evolution, opt-in/désinscription et réception de test ; URL/nom d’instance ne sont pas nécessairement secrets. |
| IA, audio, image, vidéo et recherche | familles `*_API_KEY` déclarées, notamment OpenAI, Anthropic, Google, DeepSeek, Kimi, Qwen, TTS, ASR, image, vidéo et recherche ; `MISHKAT_API_KEY`, `CRAWL4AI_API_TOKEN` | résolution de providers, génération, `lib/video/hyperframes-client.ts`, `lib/server/crawl4ai.ts` | Inventorier les providers réellement activés par la configuration runtime et LiteLLM ; reconfigurer chaque consommateur Qalem puis exercer le parcours concerné. Ne pas toucher aux clés d’un autre projet ou à celles gérées exclusivement par Hostinger/LiteLLM. |
| Paiement | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CINETPAY_API_KEY`, `ORANGE_MONEY_API_KEY`, `WAVE_API_KEY` | `lib/billing/stripe.ts`, routes paiement | Créer la nouvelle valeur fournisseur, mettre à jour le web et les webhooks, vérifier signature et paiement de recette autorisé avant révocation. |
| Qalem interne et files | `REDIS_URL`, `MCP_API_KEY`, `QALEM_VIDEO_SIDECAR_SECRET`, `QALEM_AUDIOSEAL_TOKEN` | queues/workers, routes MCP/metrics/jobs, sidecars vidéo et AudioSeal | Rotation coordonnée des deux extrémités, redémarrage contrôlé, santé et job de recette ; `REDIS_URL` peut contenir un mot de passe et doit être traité comme secret si c’est le cas. |
| Diwan | `QALEM_DIWAN_TENANT_TOKENS` | `lib/diwan/client.ts` | Le mapping tenant n’est pas disponible dans le coffre actuel. Ne pas inventer de token ; attendre contrat Diwan et secret dédié Qalem par tenant. |
| xAPI/LRS et LTI | `LRS_CONFIG_ENCRYPTION_KEY`, `XAPI_AUTH`, `LTI_PRIVATE_KEY`, `LTI_PUBLIC_KEY` | `lib/server/org-lrs-config.ts`, `lib/telemetry/config.ts`, `lib/lti/index.ts` | LRS reste option institutionnelle non activée ; vérifier chiffrement/déchiffrement de configurations tenant et signature LTI avant suppression d’ancienne clé. |
| Observabilité | `NEXT_PUBLIC_SENTRY_DSN` | build/runtime Sentry | Une DSN publique n’est pas traitée comme un secret. Vérifier projet et filtrage d’événements, pas une rotation de secret. |

## Ordre de rotation proposé

1. Restaurer le chemin de coffre/broker et son journal d’accès, sans exposer de
   valeur.
2. Établir, par catégorie, une liste de consommateurs runtime réels et une
   fenêtre de retour arrière.
3. Traiter les clés serveur Qalem à fort privilège : Supabase, communication,
   puis services internes.
4. Traiter les fournisseurs réellement actifs un par un ; vérifier un parcours
   représentatif et le débit de facturation associé.
5. Traiter paiement, LTI et LRS avec leurs systèmes destinataires.
6. Révoquer uniquement les anciennes valeurs dont tous les consommateurs ont
   été confirmés ; consigner date, catégorie, consommateurs, résultat et
   rollback, jamais la valeur.

## Comparaison de périmètre Coolify du 12 septembre 2026

Une comparaison a été effectuée uniquement en mémoire dans Coolify : chaque
valeur Qalem déchiffrée y a été comparée à des variables portant le même nom
hors des trois applications Qalem, puis seul le nombre de correspondances a
été produit. Aucune valeur, empreinte ou nom d’autre application n’a été
conservé.

Des réemplois hors Qalem ont été constatés pour les catégories ASR, Crawler,
Mishkāt, Redis, Resend, Serper, rôle de service Supabase et TTS VoxCPM. Elles
ne peuvent donc pas être révoquées depuis ce chantier.

Aucun réemploi sous le même nom de variable n’a été constaté dans Coolify pour
Evolution, les clés image OpenAI, la clé OpenAI générale et le secret du
sidecar vidéo. Cela ne prouve pas l’exclusivité du compte fournisseur ni celle
d’un consommateur hors Coolify : une rotation exige toujours la gestion du
fournisseur et la recette de tous les consommateurs Qalem.

## Conditions de clôture S6-014

- Le broker est à nouveau disponible et utilisé avec le moindre privilège.
- Chaque catégorie active a un résultat de rotation et une vérification de ses
  consommateurs Qalem ; les catégories inactives sont explicitement écartées
  avec preuve de non-injection.
- Les variables publiques/configuration ne sont pas présentées comme secrets.
- Aucune clé d’un autre projet, de Diwan, de LiteLLM Hostinger ou d’un compte
  fournisseur non placé dans le périmètre Qalem n’est modifiée.
- Le déploiement, les workers et les parcours sensibles sont sains après la
  révocation ; aucun secret n’apparaît dans les logs ou preuves.
