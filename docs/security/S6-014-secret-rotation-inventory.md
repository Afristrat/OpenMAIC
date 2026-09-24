# S6-014 — Inventaire de rotation Qalem sans valeurs

Date : 24 septembre 2026
Statut : inventaire versionné et rotations partielles effectives. Les webhooks,
le jeton capture, LTI, VAPID, le chiffrement LRS et la pseudonymisation xAPI
ont été remplacés en configuration persistante. Resend utilise désormais une
clé Qalem d'envoi restreinte au domaine autorisé. La clé virtuelle LiteLLM
propre à Qalem a été renouvelée le 24 septembre, propagée aux trois processus
et l'ancienne clé a été révoquée. Deux catégories fournisseurs distinctes
restent injectées sans preuve suffisante d'exclusivité du compte : image
OpenAI et Evolution.

## Méthode et limite

L’inventaire initial provient exclusivement des noms de variables déclarés dans
`.env.example` et de leurs consommateurs versionnés. Les contrôles ultérieurs
de rotation se limitent à des métadonnées de lignes et d’enveloppes chiffrées.
Aucune valeur, endpoint privé, fichier d’environnement ou coffre n’a été lu.
La présence d’un nom ne prouve pas qu’il est configuré ou utilisé en production.
Une clé déclarée mais non injectée ne doit pas être rotatée inutilement.

Le chemin Codex référencé par une ancienne passation est absent. Le contrôle
frais du 13 septembre 2026 établit toutefois que le broker équivalent du coffre
Claude et son loader existent et s’exécutent avec moindre privilège ; une
invocation bornée de `RESEND_API_KEY` a répondu `secret_broker_ready`, sans
afficher de valeur. L’index dérivé a été régénéré. Les rotations Qalem peuvent
donc utiliser ce broker ; l’absence du chemin Codex n’autorise toujours ni
lecture directe de fichiers de secrets, ni substitution manuelle de valeurs.

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
- Aucune clé d’un autre projet, de Diwan, aucun secret maître ou fournisseur
  de LiteLLM Hostinger, ni aucune clé d’un compte fournisseur non placé dans
  le périmètre Qalem n’est modifié. La clé virtuelle cliente propre à Qalem
  peut être renouvelée sans modifier ces secrets d’administration.
- Le déploiement, les workers et les parcours sensibles sont sains après la
  révocation ; aucun secret n’apparaît dans les logs ou preuves.

## Contrôle post-déploiement du 14 septembre 2026

Les déploiements Coolify runtime `oe116jrccsl5er8zf74ydkgv` et web
`vz7bcbu560g9i1pyko74os8t` ont terminé sur le SHA indiqué ci-dessus. Capture-worker,
worker BullMQ et web sont `healthy`, avec zéro redémarrage, `OOMKilled=false` et
un code de sortie nul ; le contrôle public `GET /api/health` répond HTTP 200. Une tentative web antérieure a
échoué avant construction : deux configurations `SUPER_ADMIN_EMAILS` non
secrètes avaient été historiquement persistées en clair. Leur contenu a été
réencodé en mémoire dans le format Laravel attendu, sans lecture ni sortie de
valeur ; un contrôle exhaustif des variables du web ne trouve plus aucune
enveloppe indéchiffrable.

Cette preuve confirme l’activation des rotations internes et du routage HTTPS
du LLM général. Elle ne clôt pas S6-014 : les clés fournisseurs partagées ou
sans inventaire fournisseur sûr, ainsi que les recettes LTI, Web Push et xAPI,
restent des conditions de clôture distinctes.

## Contrôle frais du 13 septembre 2026

La lecture des métadonnées Coolify, sans valeur, confirme que les applications
`qalem-runtime` et `qalem-web-rolling-candidate` reçoivent les catégories
attendues : Supabase, LLM/ASR/TTS/image, capture, LTI, Push, LRS/xAPI,
communication, recherche et files. Ce contrôle ne démontre ni exclusivité
fournisseur ni droit de révocation. Les familles déjà établies comme réemployées
hors Qalem restent donc exclues de toute révocation depuis ce chantier ; une
rotation fournisseur exige l’inventaire des consommateurs et une recette
fonctionnelle par catégorie.

Le contrôle Resend du même jour confirme que l’accès présent peut interroger
l’inventaire de clés du compte, mais que cet inventaire ne fournit pas une
attribution sûre entre la valeur injectée à Qalem et les consommateurs des
autres produits. Aucune valeur ni identifiant de clé n’est consigné. Une
révocation est donc interdite tant qu’une clé Resend dédiée à Qalem n’a pas été
créée, injectée, recettée et que les dépendances de l’ancienne clé ne sont pas
attribuées de façon vérifiable.

## Contrôle de continuité du 14 septembre 2026

La sonde publique `GET https://qalem.ma/api/health` répond HTTP 200 et retourne
`success=true`. Les conteneurs actifs `qalem-workers` et `capture-worker` sont
`healthy`, avec code de sortie nul, `OOMKilled=false` et `RestartCount=0` au
moment du contrôle. Cette observation ne donne pas le SHA servi par le web et
ne démontre pas une rotation fournisseur ; elle confirme seulement l’absence
de régression opérationnelle visible après les rotations internes.

## Tentative Resend annulée le 14 septembre 2026

Le contrôle par broker confirme que `ai-mpower.com` est vérifié et que la clé
existante peut gérer les clés API. Une clé d’envoi limitée à ce domaine a été
créée, mais le presse-papiers du processus automatisé a refusé de recevoir le
jeton retourné. Elle n’a donc été ni enregistrée dans le coffre ni injectée
dans Coolify. La clé orpheline, identifiée uniquement par son nom de rotation,
a été supprimée avec HTTP 200 dans la même séquence. L’ancienne clé reste seule
active. Cette tentative est annulée ; elle ne vaut ni rotation ni révocation.

## Rotation Resend dédiée du 15 septembre 2026

Une nouvelle clé Resend dédiée à Qalem a été ajoutée au coffre DPAPI par le
canal contrôlé, puis le presse-papiers et son historique ont été purgés. Les
variables `RESEND_API_KEY` et `SMTP_FROM` ont été mises à jour dans Coolify,
en production et en prévisualisation, sur `qalem-web-rolling-candidate` et
`qalem-runtime`. Les déploiements recréent le web, le worker et le
capture-worker ; le contrôle de leurs environnements ne produit que les noms
des deux variables et confirme leur présence dans chaque processus actif.

La clé antérieure n'est pas révoquée à ce stade : une recette d'envoi
authentifiée Qalem et l'attribution vérifiable de tous ses autres
consommateurs restent nécessaires avant révocation. Cette étape clôt la
création, l'enregistrement, l'injection persistante et l'activation runtime
de la clé Qalem, pas la rotation fournisseur complète.

### Correction de frontière

La première valeur déposée le 15 septembre s'est révélée être une clé
mutualisée AI-MPower. Elle n'est ni révoquée ni considérée comme une clé
Qalem. Une clé orpheline de remplacement, créée lors d'une revalidation de
coffre échouée, a été supprimée immédiatement. La clé finalement conservée
est une clé Resend `sending_access` restreinte au domaine vérifié
`ai-mpower.com` : les tentatives de gestion des domaines et des clés répondent
401 depuis le coffre, le web, le worker et le capture-worker. Les deux
déploiements Coolify ont terminé et les quatre processus sont sains, sans OOM
ni redémarrage. La valeur n’est jamais consignée.

## Rotation de la clé virtuelle LiteLLM Qalem du 24 septembre 2026

La clé virtuelle cliente propre à Qalem a été renouvelée par l’API
d’administration LiteLLM. La nouvelle clé conserve exactement les 22 modèles
attribués à Qalem. Elle a été enregistrée dans le coffre DPAPI, injectée en
production et en prévisualisation dans les applications web et runtime, puis
activée par redéploiement. Le web, le worker et le capture-worker relisent la
même nouvelle valeur et sont `healthy`, avec `OOMKilled=false`, zéro
redémarrage et un code de sortie nul. La santé publique répond HTTP 200.

Une complétion réelle sur le modèle logique `general` répond HTTP 200 avec un
choix. L’API d’information de clé répond HTTP 200 et expose le nouvel alias
Qalem avec 22 modèles. L’inventaire d’administration ne contient plus l’ancien
alias et contient une seule fois le nouveau. L’ancienne clé virtuelle est donc
révoquée. Aucun secret maître, aucune clé de fournisseur ni aucune
configuration Hostinger n’a été modifié.

Le premier contrôle distant produit par le script de rotation avait été
pollué par une erreur de citation shell. Il a été rejeté comme preuve. La
commande a été corrigée, puis les trois processus ont été recontrôlés
indépendamment avant de consigner ce résultat.

## Inventaire runtime frais du 24 septembre 2026

L’API Coolify renvoie les noms des variables du runtime mais répond HTTP 500
pour ceux de l’application web. Après deux échecs identiques, la vérification
a été faite directement dans les conteneurs actifs, en ne sortant que les noms
de variables. Les trois processus reçoivent les mêmes catégories actives :
LLM général, ASR, image, Evolution, Resend, Supabase, Crawler, Mishkāt, Serper,
VoxCPM et secrets internes Qalem. Aucun secret de paiement Stripe ni variable
générique de paiement n’est injecté.

Les comparaisons effectuées dans chaque processus, sans valeur ni empreinte,
confirment que la clé image et la clé ASR sont distinctes de la clé LiteLLM
générale. Les contrôles de périmètre antérieurs établissent que les catégories
ASR, Crawler, Mishkāt, Serper, Supabase et VoxCPM sont réemployées hors Qalem :
elles restent explicitement exclues de toute révocation dans ce chantier.

Deux catégories distinctes restent donc ouvertes : `IMAGE_OPENAI_API_KEY` et
`EVOLUTION_API_KEY`. Leur nom est propre au déploiement Qalem, mais cela ne
prouve ni l’exclusivité du compte fournisseur ni l’absence de consommateurs
hors Coolify. Elles ne seront révoquées qu’après attribution du compte,
création d’une valeur de remplacement, recette du parcours image ou
notification, puis preuve de révocation de l’ancienne valeur. S6-014 reste
ouverte pour ce résidu précis ; elle n’est plus bloquée par LiteLLM, Resend,
les secrets internes ou un paiement non configuré.
