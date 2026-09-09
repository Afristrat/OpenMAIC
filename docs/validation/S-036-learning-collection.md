# S-036 — Collecte consentie : serveur et stockage

## Complément : téléchargement depuis le profil

Lien natif vers l’API d’export, sans identifiant client, sans prefetch ni Buffer/Blob de l’export côté application. Content-Disposition du serveur décide du téléchargement ; l’erreur reste consultable dans une nouvelle fenêtre et le profil demeure disponible. Textes FR/AR/EN indiquent explicitement que les médias et l’inventaire intégral du produit ne sont pas inclus.

99895 : quatre tests API verts ; E2E initial annulé, second essai 51525 arrêté intentionnellement après diagnostic d’interception de popup. Simulation corrigée au contexte navigateur, attribut download forcé retiré. 65602 exit 0 : quatre Chromium avec fichier effectivement reçu et relu (JSON/UTF-8), nom serveur, absence de paramètres/préchargement, FR/AR/EN/RTL et erreur 503 séparée. 88964 exit 0 : TypeScript/lint global et Prettier. APIs simulées, pas d’export réel ou déploiement, pas de gate global. Ponytail : téléchargement natif sans dépendance. [Interception des requêtes de nouvelles fenêtres](https://playwright.dev/docs/api/class-page#page-route).

## Complément : suppression depuis le profil

L’ancien updateUser(data.deleted) sans suppression a été retiré. Confirmation utilisateur → DELETE serveur → validation stricte success/accountDeleted → purge outbox du compte, profil local réinitialisé, fermeture locale puis redirection. Échec serveur ou réponse malformée : dialogue conservé, erreur traduite, aucune purge locale. Requête en cours verrouillée, délai 30 s sans retry automatique. Échec local après suppression : avertissement distinct, aucune nouvelle demande destructive. Textes FR/AR/EN corrigés pour les ressources partagées et fichiers différés.

90210 : six tests API et TypeScript/lint verts ; 18925 exit 0 : TypeScript/lint puis quatre Chromium FR/AR/EN et accusé incomplet. Tests prouvent également la purge du seul outbox concerné et sa conservation après échec. APIs simulées, utilisateur E2E, runner avec overlays ; aucune suppression de compte réel, certification de révocation JWT, migration, build global ou publication. Ponytail : réemploi des composants existants. La skill Supabase a guidé le scope local et la distinction des garanties ; [référence signOut](https://supabase.com/docs/reference/javascript/auth-signout).

## Complément : rapprochement des échecs vidéo

Lecture des 500 échecs retenus par BullMQ au démarrage/chaque heure, recontrôle failed et UUID du payload métier (pas d’identifiant BullMQ deviné). Transition PostgreSQL conditionnelle generating→error seulement. Aucun fournisseur relancé, aucun fichier supprimé ; succès concurrents protégés par le statut. Redis indisponible : prochain cycle, autres purges maintenues.

8666 exit 0 : 17 tests ciblés, TypeScript et ESLint global, Prettier. Scénarios simulés : ancien identifiant numérique, doublons, état changé, payload invalide, erreur Redis/DB, zéro ligne après concurrence. Pas de rapprochement Redis/PostgreSQL réel, navigateur/build/gate global ou déploiement. Échecs évincés de Redis et artefacts ambigus conservés ; aucune clôture. Ponytail : réemploi du worker existant.

## Complément : vidéos sans job, purge par Storage

Candidate CLI 20260909214619 : lecture de métadonnées uniquement, RPC invoker service-only. Bucket exports, chemins UUID stricts propres au worker, création et dernière modification de plus d’une heure ; aucun job correspondant à l’id ou au chemin. Les jobs encore présents restent protecteurs quel que soit leur état. Lot de 100 ordonné par UUID, index public sur storage_path ; aucun changement de tables/politiques Storage. Schéma des résultats revérifié côté serveur, noms dupliqués et lots surdimensionnés refusés avant remove.

Ponytail : troisième tâche du worker de rétention existant, dix lots au boot/par heure, aucun nouveau service. Après erreur, aucune file locale n’est acquittée ; les métadonnées restantes seront relues. Le délai d’une heure est une marge opérationnelle déléguée, pas une obligation légale. Les vidéos sont téléchargées en Blob par media-orchestrator ; le fichier exports reste celui du job personnel, distinct des fichiers de classroom.

76657 exit 0 : dix tests, TypeScript/lint global et Prettier. SQL sous ROLLBACK : acteurs/jobs et sept métadonnées synthétiques, exclusions nom/préfixe/récence/job/chemin référencé et inclusion après suppression Auth. Aucun fichier réel créé ou supprimé ; zéro fixture et fonction absente après rollback. API Storage simulée dans les tests ; recette réelle, advisors complets, gate global et déploiement restent ouverts. Référence : [suppression d’objets Supabase](https://supabase.com/docs/guides/storage/management/delete-objects).

Ce lot ne nettoie pas les fichiers protégés par un job bloqué après crash, ni les médias de classroom ou imports privés. L’effacement est différé et dépend des services ; aucune clôture S-036.

## Complément : worker vidéo géré

Prise en charge native conditionnelle dans PostgreSQL, puis contrôles auteur/tenant et job actif avant/après fournisseur et dépôt. Un job déjà commencé n’est pas rejoué automatiquement ; job absent/terminé ignoré. Fichier unique sans écrasement, borne de décodage 100 Mio, formats embarqués mp4/webm seulement. Accusé de finalisation vérifié. En cas d’erreur après dépôt : fichier déjà lié conservé, issue inconnue signalée sans suppression, sinon retrait du seul objet tenté par l’API Storage. Ponytail : extraction du traitement existant pour le tester, sans service ni dépendance supplémentaire.

8381 exit 0 : huit tests, Prettier, TypeScript et ESLint global. Cas simulés : deux runners/un seul fournisseur, rejeu refusé, suppression pendant fournisseur sans upload, suppression pendant upload avec nettoyage exact, accusé de finalisation perdu mais commit retrouvé, base indisponible/fichier retenu, auteur refusé/job error. SQL enrichi s036-generation-author.sql, BEGIN/ROLLBACK sous service_role/Auth : claim conditionnel unique, cascade vidéo après suppression ; zéro fixture ensuite. Pas de fichier réel supprimé. Runner avec overlays, pas de recette navigateur/gate global ni déploiement. Référence : [suppression d’objets par API Storage](https://supabase.com/docs/guides/storage/management/delete-objects).

Réconciliation durable des issues ambiguës et crashs encore ouverte ; un fichier après succès peut devenir orphelin si le compte est supprimé ensuite. Borne mémoire appliquée au résultat déjà reçu, pas une garantie sur les buffers internes du fournisseur. Redis, imports privés/Storage et sessions/UI restent à traiter.

## Complément : lots médias et régénération vocale

Garde explicite obligatoire sur les deux générateurs de lots, raccordée aux trois appelants métier. Refus mémorisé jusqu’à la fin du lot ; vérification entre éléments, avant dépôt/retry et après dépôt. Les deux branches image/vidéo sont attendues avec allSettled avant propagation d’un échec. Les routes TTS d’édition relisent ressource/propriétaire/tenant et identité autorisée via la garde existante. Régénération complète : rapport réel exigé intégral, anciennes pistes non comptées comme preuve de génération.

35900 exit 0 : 38 tests, TypeScript et lint global sans avertissement, Prettier ; correction préalable d’un import de type de test. Fournisseurs/Storage simulés : résultat image/TTS après révocation non déposé, aucun élément suivant, refus conservé malgré réaccord, reprise propriétaire refusée, échec TTS non masqué par anciennes audioUrl. Pas de SQL modifié, navigateur supplémentaire, build/gate global ou déploiement ; runner avec overlays. Ponytail : réemploi des helpers, pas de nouveau service.

Limites : contrôles ponctuels non atomiques avec Storage, fichiers précédemment déposés non purgés dans ce lot, appels déjà partis potentiellement facturés ; worker vidéo géré distinct et purge Redis/sessions restent ouverts. Aucun effacement intégral revendiqué.

## Complément : révocation pendant la génération

La garde partagée exige maintenant un acteur et une appartenance auteur/admin/manager au tenant actif même sans courseId. Les cours existants gardent leurs contrôles propriétaire/tenant/manifeste. Le plan et la classroom recontrôlent avant/après les appels LLM ; chaque progression classroom recontrôle même sans callback externe, puis un contrôle précède persistGeneratedCourse. Aucun changement de schéma. Ponytail : garde existante réutilisée, pas de nouvelle infrastructure.

Session 65838 exit 0 sur ServeurIA : 61 tests ciblés, TypeScript et lint global sans avertissement, format vérifié. Refus sans acteur ou après suppression d’appartenance, réponse de plan rejetée après révocation dans le fournisseur simulé, aucun stockage final après révocation pendant le TTS simulé. Scripts/validation/s036-generation-author.sql exécuté sous BEGIN/ROLLBACK : rôle apprenant exclu, suppression Auth cascade sur appartenance et job durable, tenant conservé ; zéro fixture recontrôlé. La fixture initiale learner était invalide, remplacée par apprenant après inspection de la contrainte. Runner avec overlays ; pas de navigateur supplémentaire, build/gate global ou déploiement.

Ces gardes sont des points de contrôle, pas une annulation atomique fournisseur/DB/Storage. Un appel déjà parti peut être facturé ; médias intermédiaires, fenêtre entre contrôle et écriture, worker vidéo, purge Redis et Storage restent à réconcilier. Ne pas extrapoler les preuves à une interruption immédiate de tous les traitements. Documentation consultée : [observabilité Supabase](https://supabase.com/docs/guides/observability).

## Complément : agents après suppression de compte

Candidate CLI 20260909211350, dépendante de la RLS U-011 20260908190053 : owner_id devient SET NULL. Les agents publiés et ceux du tenant sont conservés sans publier de brouillon ; seuls les agents sans organisation et non publiés sont marqués au détachement. Aucun balayage des agents système déjà sans propriétaire. Le trigger BEFORE SECURITY INVOKER modifie uniquement NEW ; la tentative initiale AFTER lisant profiles échouait sous Auth à cause de la RLS org_members et a été remplacée sans nouveaux privilèges.

La fonction service-only purge_detached_personal_agents recontrôle marqueur, propriétaire absent, tenant absent et publication avant de supprimer, par lots de 1000 verrouillés SKIP LOCKED. Ponytail : raccordement au worker de rétention existant, sans service ni dépendance supplémentaire. Chaque tâche dispose de dix lots au démarrage puis par heure ; panne de télémétrie sans blocage de la purge personnelle. Délai réseau cinq secondes. La purge est différée et dépend du fonctionnement du worker : aucune garantie d’effacement instantané. Les agents privés du tenant restent conservés et inaccessibles à un autre propriétaire ; leur reprise administrative n’est pas livrée ici.

Preuve reproductible scripts/validation/s036-agent-author-erasure.sql : authentique rôle supabase_auth_admin sous BEGIN/ROLLBACK, contenu partagé et avis conservés, RLS privée inchangée, reprise par un tiers refusée, purge personnelle puis idempotence, agents jamais possédés conservés, marqueurs obsolètes sans effet, 1001 lignes purgées en 1000+1. Relecture : zéro utilisateur/agent de fixture, RPC absent et FK réelle toujours CASCADE. Session 95007 exit 0 sur ServeurIA : 17 tests worker/marketplace, TypeScript et ESLint global sans avertissement ; Prettier appliqué au test. Runner avec overlays, pas une certification du SHA propre. Pas de nouvelle recette navigateur, build/gate global, migration durable ou déploiement. Advisors CLI local indisponibles faute de base CLI locale. Références relues : [cascades Supabase](https://supabase.com/docs/guides/database/postgres/cascade-deletes) et [observabilité](https://supabase.com/docs/guides/observability).

## Complément : récupération d’un plan depuis son canevas lié

Ponytail : réutilisation de importCanvasToClassroomPlan, pas de générateur supplémentaire. Pour un brouillon importé sans propriété outline.plan : import validé et détenu par l’acteur, manifeste exact dans son tenant/propriétaire, source locale unique prête correspondant au nom du fichier. Pas d’appel Diwan/IA, pas de mutation GET. Syllabus/directive récupérés depuis le canevas lié ; titre et scènes enregistrés conservés. Résultat validé par le schéma de plan ; planOrigin=linked_canvas et notice de relecture FR/AR/EN. Pas de prétention de retrouver d’anciennes retouches du syllabus jamais enregistrées. Les valeurs par défaut sont celles du convertisseur d’import existant.

Session ServeurIA 74080 exit 0 : dix-huit tests ciblés, TypeScript/lint global sans avertissement, cinq Chromium sans retry (notice FR/AR/EN/RTL, reprise après confirmation et import initial). API simulées au navigateur ; SQL séparé réel sous BEGIN/ROLLBACK confirmant accès au lien cours/import/manifeste/source après reprise, zéro utilisateur fixture/RPC absent ensuite. Pas de nouveau schéma, d’advisors complets, de build/gate global ou de déploiement. Documentation relue : [stockage JSONB Supabase](https://supabase.com/docs/guides/database/json).

Plan récupéré conservé par le stockage existant après génération confirmée, non écrit à la lecture. Ambiguïté, canevas absent/invalide, plan déjà présent mais invalide ou brouillon non importé sans plan = 409 sans modification. Échec de lecture = 503, distinct d’une absence de plan. Suite : autres références d’auteur, jobs/Storage/sessions et critères S-036 non clos.

## Complément : plan persistant et génération après reprise

Ponytail : réutilisation du JSONB outline et de l’éditeur de plan existant. ClassroomPlan complet conservé à l’import et après génération, scènes existantes maintenues ; pas de migration. Endpoint resume avec vérification de propriété/tenant/auteur actif et validation du plan. Interface : lien depuis le brouillon attribué, choix du tenant connu, lecture avant confirmation explicite, identifiants cours/manifeste et langue conservés. Catalogue : filtre tenant ET (orphelin OU propre brouillon), pagination inchangée et booléen owned sans exposition de l’identité du propriétaire. La reprise reste accessible après rechargement.

Contrôle commun avant mise en file ET au démarrage des workers plan/génération : état draft/ready, propriétaire exact, rôle auteur dans un tenant actif, manifeste correspondant. Ancien plan absent/invalide = 409, pas de plan inventé. Pas de garantie contre une révocation après ce contrôle et pendant un appel fournisseur déjà lancé.

Preuves ServeurIA : session 46098, 63 tests ciblés et TypeScript/lint verts ; échec navigateur dû à une condition de formulaire vide appliquée à tort à l’ouverture. Correction puis 17268 exit 0 : 14 tests complémentaires, TypeScript/lint global sans avertissement et sept Chromium verts, réseau simulé (import et reprise jusqu’à confirmation, rechargement, responsabilités FR/AR/EN, erreur). Le nouveau parcours complet de plan est testé en FR ; les parcours AR/EN portent sur la reprise de responsabilité. SQL réel enrichi sous BEGIN/ROLLBACK : JSON du plan inchangé après reprise, lecture du brouillon attribué ; zéro fixture/RPC absent après la transaction. Runner avec overlays, pas un checkout propre ni une preuve déployée.

Reste : récupération des anciens plans à partir des sources conservées, fichiers privés/Storage, autres références et sessions/suppression. Pas de clôture, de build/gate global ni de nouvelle migration durable. Documentation consultée : [JSONB Supabase](https://supabase.com/docs/guides/database/json).

## Complément : interface de reprise des cours orphelins

GET courses/orphaned : admin réel du tenant actif, client utilisateur soumis à RLS, filtre tenant et owner_id NULL, pages de cinquante ordonnées par UUID, curseur, no-store et délais bornés. Aucun droit supplémentaire accordé. Composant dédié intégré au catalogue suivant Ponytail : réutilisation du bouton de reprise et de la navigation classroom, sans second système de gestion. Liste des brouillons/prêts/archivés, confirmation explicite, erreurs visibles, FR/AR/EN/RTL, aucune génération ni publication automatique. Montage indexé par tenant et annulation des requêtes à la sortie.

ServeurIA, runner avec overlays : quatorze tests API verts ; TypeScript/lint global verts (12966). La première passe navigateur échouait uniquement sur un sélecteur alert ambigu avec l’annonceur Next. Sélecteur limité à la section, puis six Chromium verts sans retry (62569) : catalogue existant, trois langues et reprise non confirmée. API simulées : cette recette ne prouve pas une connexion de bout en bout à la production. Preuve SQL réelle enrichie et ROLLBACK : visibilité du cours prêt et du brouillon sans auteur via rôle authenticated de l’administrateur ; zéro fixture et RPC absent ensuite. Aucun déploiement ni gate global/build. Documentation consultée : [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Reste explicite : l’interface reprend la responsabilité, mais ne relance pas encore la génération d’un brouillon. Le ClassroomPlan complet n’est pas stocké dans courses.outline ; il faut réconcilier ce parcours sans fabriquer ses objectifs à partir des seules scènes. Fichiers d’import, sessions/suppression et reste du PRD toujours ouverts.

## Complément : cours orphelins et reprise administrateur

Migration 20260909203617_course_author_erasure.sql : courses/course_imports préservés, attribution retirée et insertion sans auteur refusée. RPC reclaim_orphaned_course invoker réservé au service ; vérification de l’administrateur réel du tenant actif sous verrou, refus de reprise d’un cours encore attribué, import et stage orphelins réattribués. Nouveau manifeste pour l’administrateur reprenant le cours, ancienne version immuable conservée. POST courses/[courseId]/reclaim n’accepte pas d’identité fournie par le client, impose l’origine et valide le résultat.

Preuve scripts/validation/s036-course-reclaim.sql avec candidates Diwan/sources, exécutée sous transaction et ROLLBACK sur PostgreSQL Qalem : suppression via rôle Auth, conservation des contenus, reprise via service_role, refus apprenant/cours attribué, répétition sans nouveau manifeste et exécution publique interdite. Zéro fixture Auth et RPC absent ensuite. Session 8356 terminée avec code 0 : cinq tests API, TypeScript et lint global sans avertissement. Runner ancien avec overlays ciblés, pas un checkout propre du SHA final.

Limites ouvertes : pas d’appelant UI ni de parcours navigateur de reprise ; brouillons à rendre découvrables aux administrateurs. Pas de traitement des imports privés ni du chemin Storage portant l’ancien auteur. Pas de gate global/build, d’advisors complets ou de déploiement durable. Cette preuve n’est pas une clôture S-036.

## Complément : sources et manifestes conservés

Migration CLI 20260909203142_organization_source_author_erasure.sql, après la candidate Diwan 20260909121728. Retrait de l’auteur sans destruction des sources ni des versions de manifeste ; création de source sans auteur toujours refusée. Triggers invoker, search_path vide, exécution publique révoquée ; exception de mutation limitée au profil réellement supprimé et à la seule attribution. Les types de lecture admettent null, ceux d’insertion exigent un auteur.

scripts/validation/s036-source-author-erasure.sql exécuté sur PostgreSQL réel sous rôle Auth, dans BEGIN/ROLLBACK : comparaison du contenu, accès du membre restant et exclusion après retrait, manifeste toujours immuable. Aucun utilisateur persistant, ancienne FK CASCADE recontrôlée. TypeScript/lint global verts, 28246 exit 0. Quatre tests de résolution verts après formatage, dont source sans auteur utilisée dans une sélection courante. Aucun navigateur ni déploiement. La reprise d’un ancien manifeste dans resolveFormationSources demeure limitée à son owner_id : à traiter avec l’autorisation de reprise du cours, pas en ouvrant aveuglément tous les manifestes au client. Advisors complets et gate global restent ouverts.

## Complément : acteurs des transmissions

Migration 20260909202303 : retrait des FK personnelles par SET NULL sous condition de profil réellement absent ; les nouvelles transmissions restent liées à deux membres du tenant. API détail sans recherche de profil nul, libellé neutre traduit FR/AR/EN et types distinguant lecture nullable/création obligatoire. Le lecteur utilise une section nommée, dans le main du layout existant. Worker inspecté : artefact filigrané par watermark_id, sans dépendance aux champs d’identité.

SQL réel sous supabase_auth_admin et ROLLBACK : deux transmissions en sens opposés, acteur supprimé exclu par RLS, autre partie conservant ses deux accès, tiers sans accès, seconde suppression réussie ; création sans destinataire et effacement manuel d’un acteur vivant refusés. Preuves combinées avec les migrations de collecte, références partagées et widgets réussies. CASE de fixture corrigé avant la réussite. Vérification séparée : zéro fixture, deux FK de production encore RESTRICT. Dix tests API ciblés verts. Les premiers E2E ont relevé les deux main imbriqués ; correction validée : session 42167 exit 0, TypeScript/lint global sans avertissement et quatre parcours Chromium sans retry (FR/AR/EN/RTL et lecture existante), API simulées. Pas de purge des fichiers externes, de gate global, d’advisors complets ou de déploiement. Référence : [sécurité par ligne Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Complément : auteurs des widgets

Migration candidate CLI 20260909201746 : quatre attributions Auth détachables ; création sans auteur toujours refusée. Trigger invoker avec search_path vide, exécution publique révoquée. Une version ne peut changer que lors de sa première publication ou pour retirer une attribution dont le compte Auth est effectivement supprimé ; tous les autres champs doivent rester égaux. Les consommateurs published-widget-template.ts lisent composition et publication, pas l’identité de l’auteur.

SQL réel sous ROLLBACK : auteur et publicateur distincts supprimés avec SET ROLE supabase_auth_admin, contenu et publication conservés, brouillon sans auteur publiable, filtre RLS authenticated publié/brouillon inchangé. Attaques sur attribution vivante, composition, identité de version et suppression refusées ; création sans auteur refusée. Le harnais initial postgres ne pouvait pas adopter ce rôle ; supabase_admin l’a permis sans GRANT ajouté. Contrôle séparé : zéro fixture et fonction candidate absente. Tests existants ciblés 18/18, TypeScript/lint global sans avertissement, session ServeurIA 38085 exit 0. Pas d’appel Auth HTTP ni de recette navigateur dans ce lot. Les advisors complets restent ouverts (base CLI locale absente), aucune migration durable ni clôture. Référence consultée : [fonctions Supabase et droits invoker](https://supabase.com/docs/guides/database/functions).

## Complément : préservation des ressources partagées

Migration créée par Supabase CLI : 20260909201309_account_shared_references.sql. Cinq références déjà nullables (classroom_templates.created_by, curriculum_links.created_by, org_invitations.created_by, payments.user_id, shared_classrooms.shared_by) deviennent ON DELETE SET NULL. Les contenus, montants et invitations du tenant sont conservés ; aucun nouveau privilège ni changement de politique RLS. Ce détachement ne prétend pas nettoyer les champs libres ou métadonnées pouvant contenir des informations personnelles.

Preuve scripts/validation/s036-shared-references.sql sur PostgreSQL réel, avec la migration de collecte et le test d’atomicité : suppression Auth directe, comparaison JSON avant/après de chaque ressource hors référence, isolation de l’autre acteur, formations préservées, RLS active. Tout sous ROLLBACK. Deux erreurs de fixture corrigées (FK temporaire/persistante et capacité de sièges pour invitation) ; dernière exécution réussie. Vérification séparée : zéro utilisateur de recette, cinq FK de production inchangées (NO ACTION). Advisors CLI --local indisponibles : connexion refusée à 127.0.0.1:54322, pas un avis de sécurité favorable. Aucune migration appliquée durablement. Transmissions, widgets, Storage, autres cascades et sessions restent ouverts.

## Complément : frontière de suppression du compte

Le candidat retire la purge multi-requêtes de account/delete : un seul appel Auth dur, identité vérifiée et origine contrôlée. Le script de recette transmet Origin. Succès limité à accountDeleted ; erreurs opaques, aucun retry automatique ni affirmation de rollback après une réponse réseau perdue.

ServeurIA : six tests API verts (auth, deux origines refusées, acteur serveur, refus SQL simulé, panne ambiguë), TypeScript/lint global sans avertissement, session 58947 exit 0. Complément après modification du script de recette : format, TypeScript/lint global, 94386 exit 0. SQL scripts/validation/s036-account-delete.sql exécuté avec migration collection candidate dans BEGIN/ROLLBACK : FK restrictive sans perte partielle, puis cascade des mesures et conservation de stage/scenes. Fixture requirements corrigée en jsonb après premier refus ; seconde preuve réussie. Zéro utilisateur de fixture et absence du schéma candidat recontrôlés.

Limites : preuve SQL directe, pas appel Auth HTTP ni parcours navigateur de suppression ; aucune donnée utilisateur réelle supprimée. Les références métier restrictives, Storage, autres biens partagés et jetons déjà émis restent ouverts. Supabase confirme que la suppression Auth bloque les renouvellements mais ne révoque pas rétroactivement les JWT et peut être empêchée par la propriété Storage : [gestion des utilisateurs](https://supabase.com/docs/guides/auth/managing-user-data), [deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser). Pas de clôture, migration durable ou déploiement.

## Candidat du 9 septembre 2026

Autorisation : feu vert et délégation consignés dans `docs/decisions/2026-09-09-unblock-prd.md`. Aucun déploiement, migration durable ou branchement navigateur dans cette itération. `passes=false`.

- `POST /api/learning-observations` : session vérifiée, origine contrôlée, consentement vérifié avant lecture du corps, JSON strict et borné à 32 Kio/cinq secondes. Aucun identifiant utilisateur ni hash accepté dans les mesures.
- `collectPedagogyData` appelle désormais le RPC `record_consented_learning`. Suppression de l’ancien hash déterministe à sel facultatif et de l’insertion directe sans contrôle.
- Le RPC verrouille le consentement puis vérifie l’appartenance à l’organisation active de la formation. Le rôle public/authentifié ne peut pas l’appeler directement. Deux envois portant le même identifiant de session ne créent pas deux observations.
- Identifiant pseudonyme aléatoire hashé par utilisateur/organisation, lien conservé exclusivement dans un schéma privé avec RLS. Le retrait supprime le lien et les observations liées par cascade ; la suppression du consentement/profil cascade également.
- Un trigger à privilèges élevés est nécessaire pour exécuter cette suppression lorsqu’un utilisateur retire directement son accord via RLS. Fonction sans argument dans le schéma privé, chemin de recherche vide, exécution publique révoquée ; elle n’utilise que l’identité de la ligne modifiée.
- Rapports existants : lecture serveur des mesures après autorisation, filtre `org_id` explicite, erreur de stockage visible, taux 0–1 convertis en pourcentages. Les réponses restent agrégées.

## Preuves exécutées

Tout sur ServeurIA dans `qalem-refork-exec` / `.codex-gate-s3-008-fe6ebba`.

- Migration créée avec Supabase CLI : `20260909185224_consented_learning_collection.sql`.
- Exécution SQL réelle sous transaction annulée : création du schéma/RLS/RPC/trigger, collecte sans accord refusée, collecte avec accord acceptée, déduplication, formation non autorisée rejetée. Appels sous `service_role`, retrait sous `authenticated` avec `auth.uid()` réel de la fixture. Vérification de l’effacement des lignes et de la révocation des droits d’exécution publics. `ROLLBACK` confirmé : aucune donnée ni structure durable modifiée.
- Script reproductible : `scripts/validation/s036-learning-collection.sql`, après la migration dans une transaction se terminant par ROLLBACK.
- Session 45084 exit 0 : 23 tests ciblés (collecte + consentement), TypeScript et lint global.
- Session 53785 exit 0 : 11 tests collecte/rapports, TypeScript et lint global après raccordement des agrégats. Quatre tests de rapports vérifient notamment le filtre d’organisation et l’absence de données individuelles dans JSON/CSV/PDF.

## Restes de cette US, sans nouvelle demande d’autorisation

### Complément : version du consentement

Le 9 septembre, la migration candidate ajoute `collection_epoch`, générée côté base et renouvelée uniquement lorsque le choix change. Une écriture directe ne peut ni choisir ni restaurer cette version. GET consentement renvoie l’époque ; les observations doivent la fournir et le RPC la compare sous le même verrou que le booléen. Une ancienne observation reste refusée après retrait puis nouvel accord. Aucun nouveau secret ni dépendance.

Preuve SQL réelle enrichie, toujours sous ROLLBACK : refus de l’ancienne époque, tentative de restauration rejetée, époque conservée lors d’un accord inchangé, nouvelle collecte puis effacement via le rôle authenticated. Session 51447 exit 0 : 24 tests ciblés, TypeScript et lint global. La lecture échoue explicitement si la migration/époque manque ; appliquer la migration avant la future version applicative, jamais présenter ce candidat comme déployé. Pas de nouveau parcours navigateur dans ce complément. `pg_cron` absent de la base au contrôle système : prévoir la purge via le worker existant, pas une tâche SQL supposée installée.

1. Producteur navigateur et outbox persistante raccordés (compléments ci-dessous). La recette du quiz et les limites de persistance navigateur restent à prendre en compte avant clôture.
2. Purge périodique candidate codée (complément ci-dessous), à publier et vérifier au runtime. Contexte de sujet à dériver côté serveur plutôt que faire confiance à des textes du navigateur. Ne pas présenter les mesures client comme des résultats certifiés.
3. Épreuve de concurrence à deux transactions ; le verrou est codé mais le test actuel est séquentiel.
4. Vérification navigateur, gate global, migration durable et recette de l’API déployée.
5. Anciennes lignes sans nouveau lien : ne pas inférer leur propriétaire. La route compte/delete cherche encore `pedagogy_telemetry.user_id`, colonne absente ; remplacer sa boucle destructive et ses faux succès. L’export est corrigé dans le complément ci-dessous, encore non déployé.
6. Les consommateurs optimiseur/Director doivent conserver un filtre de tenant même si une formation change d’organisation. Le raccordement discussion S-047 reste séparé.

Ponytail : tables, consentement et rapports réutilisés ; contraintes/cascades PostgreSQL avant mécanisme applicatif de suppression. Références : [fonctions Supabase](https://supabase.com/docs/guides/database/functions), [sécurité des produits](https://supabase.com/docs/guides/security/product-security), [changelog](https://supabase.com/changelog).

## Complément navigateur du 9 septembre 2026

Contrôle final après correction du périmètre d’erreur par compte/formation et du compteur de navigation confirmée : session 59064 exit 0, formatage ciblé, TypeScript et lint global sans avertissement.

Le lecteur transmet les changements de mode, les fins de scènes et les navigations ; le quiz transmet seulement son score calculé. La collecte démarre après réponse positive du serveur avec époque valide et revérifie cette époque avant chaque tentative d’envoi. Le retrait notifié dans la page ou un autre onglet supprime immédiatement les tampons ; la base reste la frontière atomique pour une révocation concurrente.

Mesures : temps de présence au premier plan (pas temps d’écoute certifié), séquence de types de scènes, scores réellement disponibles, compteurs play/pause/seek et proportion de scènes terminées. Une navigation vers la page finale ne produit pas 100 % de complétion. Langue et niveau non établis restent null, sans profil débutant inventé ; aucun message brut ni identifiant utilisateur dans le corps. Mesures bornées à 256 visites, 24 heures cumulées et 10 000 actions par type.

L’envoi échoué reste visible et peut être rejoué avec le même identifiant et le même corps. Une ancienne époque ne devient jamais une nouvelle autorisation par réétiquetage. La reprise après fermeture et le renouvellement du tampon lors du retour à une scène sont désormais implémentés dans le complément suivant ; la recette réelle du quiz reste à compléter avant clôture.

## Complément : outbox persistante

Le stockage local natif remplace le tampon d’envoi uniquement en mémoire. Une clé par utilisateur/session évite l’écrasement de la file d’un autre onglet ; le serveur conserve la déduplication atomique. Le schéma Zod est partagé dans un module sans client Supabase serveur. L’écriture est synchrone avant le réseau lors de la fin du parcours ou de pagehide. Les envois conservés reprennent à l’ouverture d’une classroom, au retour réseau ou sur demande ; chaque tentative revérifie l’époque. Après un retrait dans le profil, la file locale du compte est purgée même sans lecteur monté.

## Complément : conservation serveur, candidat non déployé

Choix de produit sous mandat délégué : conserver les nouvelles mesures liées au consentement pendant 180 jours. Ce délai est une décision fonctionnelle, pas une affirmation de délai légal obligatoire. La migration `20260909193812_learning_observation_retention.sql`, créée via CLI, limite chaque purge à 1000 lignes strictement plus anciennes que 180 jours. Index partiel, verrous SKIP LOCKED et fonction SECURITY INVOKER réservée à service_role. Les anciennes mesures sans subject_hash restent à réconcilier séparément. Le lien privé par compte/organisation reste disponible pour le retrait ; pas de suppression concurrente risquant de cascader une nouvelle observation.

Le worker existant démarre une boucle dédiée au boot puis chaque heure, dix lots maximum par cycle ; pas de chevauchement dans un processus, reprise au cycle suivant en cas d’échec et attente du travail en cours à l’arrêt. La borne représente 10 000 lignes par cycle et par processus ; surveiller le retard réel avant d’augmenter la cadence. Pas de nouveau Redis, extension pg_cron ou service externe.

Preuves ServeurIA : session 9957 exit 0, deux tests du worker (RPC sans paramètre de portée, accusés invalides/erreurs, borne, reprise horaire et arrêt), TypeScript et lint global sans avertissement. PostgreSQL Qalem 15.8.1.085 : migration préalable + migration de rétention + `scripts/validation/s036-learning-retention.sql` exécutés dans BEGIN/ROLLBACK. Vérifiés : une ligne expirée supprimée, ligne exactement à 180 jours et ligne récente conservées, ancienne ligne non liée intacte, deuxième purge vide, puis 1001 lignes expirées traitées en 1000+1 et accès anon/authenticated absent. Deux exécutions entièrement annulées ; aucune suppression durable. Pas de recette navigateur supplémentaire pour cette tâche serveur, pas de gate global ni de déploiement.

L’inspection fraîche du schéma des comptes confirme que corriger uniquement pedagogy_telemetry.user_id ne suffira pas : stages utilise owner_id et scenes utilise stage_id. Plusieurs références au profil sont RESTRICT/NO ACTION (notamment transmissions, invitations, paiements et modèles) ; stages.owner_id est ON DELETE SET NULL, ce qui préserve le bien du tenant. La route account/delete reste à corriger avant toute recette destructive. L’export est corrigé dans le complément suivant. Références actuelles consultées : [fonctions Supabase](https://supabase.com/docs/guides/database/functions) et [changelog](https://supabase.com/changelog).

## Complément : export personnel paginé

Migration CLI `20260909194624_account_export_pages.sql` et route GET account/export corrigées. Le RPC SECURITY INVOKER réservé au service sélectionne uniquement les onze sections nommées dans le manifeste ; noms de tables/colonnes sur liste fermée et paramètres liés. Les formations/scènes exigent la propriété et, pour un tenant, une appartenance encore active ; les observations personnelles passent par le lien privé effaçable, jamais une supposition à partir de l’ancien hash. Les corps de lignes sont retournés sans jointure susceptible d’exposer une autre identité.

Pages de 100 lignes, ordre explicite et curseur strictement croissant ; JSON transmis progressivement selon la consommation du client, sans agrégation de tout l’export dans le processus web. Pas de limite silencieuse de 1000 résultats. Le flux finit par complete=true seulement après toutes les sections. Une panne initiale renvoie 503 générique ; une panne ultérieure interrompt le corps, sans JSON valide annonçant une réussite. Chaque lecture a un délai de cinq secondes ; l’annulation interrompt les requêtes. Cache-Control no-store et fichier joint conservés.

Preuves ServeurIA : quatre tests API vérifient auth, identité imposée, pagination 100+1, panne initiale et interruption tardive. Session 36061 exit 0 : TypeScript/lint global. SQL réel sous ROLLBACK : deux acteurs et un tenant de deux sièges synthétiques, 1001 observations propres paginées, exclusion d’une observation tierce et d’une ancienne ligne non liée, scènes/formation propres seulement, retrait du tenant fermant leur accès, toutes les sections existantes exécutables et table arbitraire refusée. Le premier essai avait omis le second siège ; la fixture a été corrigée, sans modifier les contrôles métier. Zéro utilisateur de recette persistant et absence de la fonction candidate recontrôlés après rollback. Script reproductible : scripts/validation/s036-account-export.sql.

Limites non masquées : registre de onze sections hérité, pas une certification de portabilité de toutes les nouvelles tables du produit ; données lues entre exportedAt et completedAt, sans instantané transactionnel unique entre les pages ; taille d’une page bornée en lignes, pas en octets. Aucun appelant UI account/export trouvé par git grep : accès direct à l’API possible après publication, mais raccordement et téléchargement navigateur réel restent à faire. Suppression atomique, gate global, migrations durables et publication restent ouverts. Ponytail : client de service partagé, pagination native et stream standard, aucune dépendance ajoutée. Référence : [RPC Supabase](https://supabase.com/docs/reference/javascript/rpc).

### Bornes et preuves de l’outbox navigateur

Bornes : 128 observations en attente par compte, 32 Kio par entrée ; expiration après sept jours, appliquée à la prochaine lecture de la file. Les entrées malformées sont supprimées, jamais envoyées. Quota ou stockage inaccessible provoquent une erreur visible et conservent le dernier échec en mémoire tant que la page existe ; aucune promesse de persistance dans ce cas. La file n’est pas un coffre chiffré : elle ne contient ni messages, ni credentials, mais des mesures structurées. Le navigateur peut effacer ses données ; une interruption brutale avant pagehide ne garantit pas la sauvegarde du parcours encore en mémoire. La rétention serveur est distincte, décrite ci-dessus.

Preuves : session 80639 exit 0, sept parcours Chromium dont fermeture réelle de l’onglet puis reprise dans un nouvel onglet avec corps identique, et suppression sans POST si l’époque a changé. Session 96884 exit 0 : 35 tests ciblés, TypeScript/lint global sans avertissement, quatre parcours consentement FR/AR/EN avec contrôle de suppression de la seule file du compte courant. Le premier essai utilisait le mock de refus global prioritaire à celui du contexte ; son retrait explicite corrige le montage du test. Aucun déploiement ni application de migration. Ponytail : stockage natif borné, aucune dépendance ajoutée, aucune résurrection de l’ancienne syncQueue supprimée.

Preuves ServeurIA : session 91105 exit 0, cinq parcours Chromium sans retry automatique : refus (zéro POST), accord (une observation après narration terminée), erreur 503 puis reprise identique, changement d’époque sans nouvel envoi, scène sautée sans fausse complétion. Le premier scénario de certificat était inadéquat pour une formation sans quiz ; corrigé pour vérifier la région de fin. Les essais d’erreur ont révélé une clé de traduction absente, remplacée par un libellé de collecte dédié FR/AR/EN. Session 49535 exit 0 : 47 tests ciblés, TypeScript et lint global. APIs/auth simulées, pas de recette de production ; vérification UI effectuée en anglais dans ce complément, FR/AR restent à couvrir pour l’alerte. Aucun nouveau déploiement ni migration durable.
