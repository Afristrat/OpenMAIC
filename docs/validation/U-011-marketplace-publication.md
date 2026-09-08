# U-011 — Publication des agents

État au 8 septembre 2026 : code déployé et recette authentifiée réussie ; suivi de santé post-déploiement encore en cours. Ne pas interpréter ce document comme une clôture avant la fin du suivi.

## Périmètre et preuves

| Exigence | Preuve acquise |
| --- | --- |
| Action visible et autorisée | Sélection d’un tenant actif et d’un agent local dans la marketplace ; confirmation explicite avant création du snapshot et publication. Recette Chromium réelle réussie. |
| Profil conservé | La recette compare le profil publié avec l’entrée : persona, avatar, actions, priorité, genre, poids et voix. Les tests unitaires couvrent aussi les attributs métier avancés et leur réimportation. |
| Publication persistante | Rechargement réel du navigateur, lecture de la fiche publiée, puis vérification directe de la ligne propriétaire/tenant en base. |
| Retrait et reprise | Retrait depuis l’interface, fiche devenue 404, rechargement privé, republication du même identifiant. Exactement un snapshot stocké. |
| Isolation | API réelle : création dans un tenant étranger refusée en 403. Preuve SQL réelle : refus d’affectation étrangère, réaffectation du tenant interdite, ligne privée inaccessible à un autre propriétaire. |
| Départ ou suspension du tenant | Preuve SQL : publication interdite après suspension/départ ; retrait toujours permis au propriétaire. |
| Aucun résidu de recette | Relecture SQL indépendante après suppression : zéro compte `qalem-u011-…@example.invalid`, zéro organisation `U011 proof …`, zéro agent temporaire. Révocation : logout 200, renouvellement 400 sans session. |

La recette utilise uniquement des comptes et données temporaires. Aucune API n’est simulée dans `scripts/proofs/u011-marketplace-production.mjs`. Aucun e-mail ni fichier de session n’est créé. Les scénarios FR/AR/EN du harnais E2E utilisent, eux, des réponses simulées ; leurs preuves ne remplacent pas la recette réelle.

## Versions et validations

- Arbre applicatif validé : `b87c3a7` ; migrations incluses.
- Gate complet antérieur `add6ce4` : Prettier, TypeScript, ESLint, 451 fichiers / 2 727 tests Vitest, build et 119 Playwright.
- Depuis ce gate, la racine Next est explicitement le dépôt ; des privilèges SQL ont été retirés et le déclencheur de date sécurisé. TypeScript/lint et Chromium ciblé ont été revalidés, puis build de 115 pages et 119/119 Playwright sans retry sur `b87c3a7` (session 32917, exit 0).
- Journal hôte : `/tmp/qalem-u011-build-b87c3a7.log` ; SHA-256 `cce78956125e8da3082e5be8ac2ec2f37c7643c74b8dcb112f67d019ef729409`. Aucun avertissement Next ou erreur WebServer repéré par le contrôle ciblé du journal.
- Déploiement Coolify : `icqwdtj4bruc9197m5pg8bxh`, terminé le 8 septembre à 19:53:06 UTC.
- Image web réelle : `bcx5pxyuc9z3lt4jtyjipcqu:00f1c3eab8bf0e627cf6d078a74c1754df7fc6c2`. Les différences depuis le code validé concernent la passation et le script de recette, pas le produit.
- Recette réelle : session 37468, exit 0, script `307db51` puis formatage transféré dans `8cd7772`. Le premier essai 30198 a échoué sur la révocation et a été nettoyé ; sa cause n’est pas établie. Aucun correctif produit n’est attribué à cette reprise.
- Retour arrière web de référence : image saine `1a51683deda94eeb6e200839a6c12b22db0bae9e`. Aucun retour arrière n’a été exécuté ni nouvellement testé.

## Base et persistance

Les migrations `20260908182819_agent_profile_snapshot.sql` et `20260908190053_agent_publication_rls.sql` ont d’abord passé le scénario SQL dans une transaction annulée, puis ont été appliquées ensemble avec COMMIT sur la base Qalem. Le cache PostgREST a été rechargé.

Relecture indépendante : colonne `profile_extensions` non nulle, cinq policies destinées à `authenticated`, SELECT anonyme refusé, TRUNCATE connecté refusé, modification de `org_id` refusée et publication modifiable. Le déclencheur `handle_updated_at()` utilise désormais `search_path=pg_catalog`.

Les données PostgreSQL vivent dans le volume nommé `lkqqmwsn5zydykuv3gd6q7ws_supabase-db-data`, monté sur `/var/lib/postgresql/data`. Cette installation ne possède pas de table `supabase_migrations.schema_migrations` : aucun historique CLI fictif n’est revendiqué.

## Limites et suite

Le suivi 5525, commencé à 19:58:43 UTC, doit produire 31 contrôles espacés de 30 secondes, puis un comptage des erreurs des logs. Tant qu’il n’est pas terminé, `passes=false` reste requis. Ce suivi ne certifie pas une capacité maximale ni l’absence future d’OOM.

L’audit Supabase après migration ne signale pas `agent_configs`. Il laisse cinq avertissements de search_path sur d’autres fonctions : `update_updated_at`, `get_user_org_ids`, `assert_transmission_tenant_membership`, `assert_course_tenant_integrity`, `prevent_widget_template_version_mutation`. Onze tables avec RLS sans policy sont également signalées au niveau INFO ; leur rôle serveur doit être audité avant de conclure à un défaut. Ces constats restent ouverts au niveau du projet, sans modifier leurs droits dans U-011.

Référence active des critères : `.ralph/prd-v3.json`, entrée U-011. L’état du PRD complet n’est pas déduit de cette seule livraison.
