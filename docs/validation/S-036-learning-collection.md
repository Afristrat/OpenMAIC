# S-036 — Collecte consentie : serveur et stockage

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
5. Anciennes lignes sans nouveau lien : ne pas inférer leur propriétaire. Les routes compte/export et compte/delete cherchent actuellement `pedagogy_telemetry.user_id`, colonne absente du schéma versionné ; réconcilier leur traitement sans faux succès.
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

L’inspection fraîche du schéma des comptes confirme que corriger uniquement pedagogy_telemetry.user_id ne suffira pas : stages utilise owner_id et scenes utilise stage_id. Plusieurs références au profil sont RESTRICT/NO ACTION (notamment transmissions, invitations, paiements et modèles) ; stages.owner_id est ON DELETE SET NULL, ce qui préserve le bien du tenant. Les anciennes routes account/delete et account/export restent non corrigées dans ce lot : traiter leurs frontières et leur atomicité avant toute recette destructive. Références actuelles consultées : [fonctions Supabase](https://supabase.com/docs/guides/database/functions) et [changelog](https://supabase.com/changelog).

### Bornes et preuves de l’outbox navigateur

Bornes : 128 observations en attente par compte, 32 Kio par entrée ; expiration après sept jours, appliquée à la prochaine lecture de la file. Les entrées malformées sont supprimées, jamais envoyées. Quota ou stockage inaccessible provoquent une erreur visible et conservent le dernier échec en mémoire tant que la page existe ; aucune promesse de persistance dans ce cas. La file n’est pas un coffre chiffré : elle ne contient ni messages, ni credentials, mais des mesures structurées. Le navigateur peut effacer ses données ; une interruption brutale avant pagehide ne garantit pas la sauvegarde du parcours encore en mémoire. La rétention serveur est distincte, décrite ci-dessus.

Preuves : session 80639 exit 0, sept parcours Chromium dont fermeture réelle de l’onglet puis reprise dans un nouvel onglet avec corps identique, et suppression sans POST si l’époque a changé. Session 96884 exit 0 : 35 tests ciblés, TypeScript/lint global sans avertissement, quatre parcours consentement FR/AR/EN avec contrôle de suppression de la seule file du compte courant. Le premier essai utilisait le mock de refus global prioritaire à celui du contexte ; son retrait explicite corrige le montage du test. Aucun déploiement ni application de migration. Ponytail : stockage natif borné, aucune dépendance ajoutée, aucune résurrection de l’ancienne syncQueue supprimée.

Preuves ServeurIA : session 91105 exit 0, cinq parcours Chromium sans retry automatique : refus (zéro POST), accord (une observation après narration terminée), erreur 503 puis reprise identique, changement d’époque sans nouvel envoi, scène sautée sans fausse complétion. Le premier scénario de certificat était inadéquat pour une formation sans quiz ; corrigé pour vérifier la région de fin. Les essais d’erreur ont révélé une clé de traduction absente, remplacée par un libellé de collecte dédié FR/AR/EN. Session 49535 exit 0 : 47 tests ciblés, TypeScript et lint global. APIs/auth simulées, pas de recette de production ; vérification UI effectuée en anglais dans ce complément, FR/AR restent à couvrir pour l’alerte. Aucun nouveau déploiement ni migration durable.
