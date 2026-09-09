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

1. Producteur navigateur : temps réellement observés, séquence, scores/actions et fin de parcours ; aucun envoi avant opt-in, reprise fiable et arrêt au retrait. Utiliser l’époque désormais fournie par le serveur, sans relire une nouvelle époque pour réétiqueter d’anciennes mesures.
2. Politique de conservation et purge périodique ; contexte de sujet à dériver côté serveur plutôt que faire confiance à des textes du navigateur. Ne pas présenter les mesures client comme des résultats certifiés.
3. Épreuve de concurrence à deux transactions ; le verrou est codé mais le test actuel est séquentiel.
4. Vérification navigateur, gate global, migration durable et recette de l’API déployée.
5. Anciennes lignes sans nouveau lien : ne pas inférer leur propriétaire. Les routes compte/export et compte/delete cherchent actuellement `pedagogy_telemetry.user_id`, colonne absente du schéma versionné ; réconcilier leur traitement sans faux succès.
6. Les consommateurs optimiseur/Director doivent conserver un filtre de tenant même si une formation change d’organisation. Le raccordement discussion S-047 reste séparé.

Ponytail : tables, consentement et rapports réutilisés ; contraintes/cascades PostgreSQL avant mécanisme applicatif de suppression. Références : [fonctions Supabase](https://supabase.com/docs/guides/database/functions), [sécurité des produits](https://supabase.com/docs/guides/security/product-security), [changelog](https://supabase.com/changelog).
