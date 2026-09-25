# S3-013 — Politique de sollicitation et mesure du parcours

## État certifié au 25 septembre 2026

La dette autonome de S3-013 est soldée dans le code, PostgreSQL et le harnais de validation. La story reste `to_validate` et `passes=false` parce que sa clôture exige encore une réception physique sur mobile et une validation humaine de l’expérience. Une acceptation du fournisseur, une ouverture authentifiée ou une recette navigateur ne prouvent pas cette réception.

## Sauvegarde et migrations de production

Avant la dernière évolution du schéma, une sauvegarde compressée a été créée et vérifiée sur ServeurIA :

- fichier privé : `/home/serveuria/backups/qalem/s3-013-before-20260925-journey-controls.sql.gz` ;
- SHA-256 : `835eac419aba6a42ca25559c6fabf82b232bbc0a6f0b0fbb72145fa40059a13e` ;
- taille : 108 606 octets.

Les migrations suivantes sont appliquées en production :

- `20260925090000_enforce_course_notification_quiet_window.sql` : fenêtre silencieuse atomique ;
- `20260925093000_attest_course_resume_opening.sql` : ouverture authentifiée distincte de l’acceptation fournisseur ;
- `20260925100000_prioritize_notification_pressure.sql` : priorité déterministe entre files ;
- `20260925103000_report_anchoring_journey.sql` : indicateurs par fenêtre et dénominateurs explicites ;
- `20260925104500_course_notification_windows.sql` : fuseau, heures silencieuses et désactivation par formation.

La fonction historique `course_notification_candidate_eligible` appartenait à `supabase_admin`, contrairement au propriétaire attendu par les migrations. Après la sauvegarde, son propriétaire a été normalisé vers `postgres`, sans modifier son contrat ni élargir ses droits.

## Contrats désormais couverts

- Les contrôles globaux et par formation portent la cadence, le plafond, la pause, la désactivation, le fuseau IANA et les heures silencieuses, y compris une plage traversant minuit.
- Le worker relit les préférences juste avant la réservation atomique. La base reste l’autorité en cas de concurrence, de reprise ou de retry.
- Le plafond partagé, le budget propre à la formation, la déduplication et la priorité entre reprise, ancrage et évaluations sont arbitrés transactionnellement.
- Une formation désactivée annule ses reprises en attente et ne produit aucun aperçu de rappel.
- Le détail privé reste derrière l’authentification. La notification d’écran verrouillé ne contient pas de propos privés ni de nom de tiers.
- Les états tentative, acceptation fournisseur, ouverture authentifiée et réponse sont séparés. La réception physique reste volontairement non déduite.
- Les évaluations chaudes conservent pertinence et souhait de revenir ; les évaluations froides ajoutent l’application déclarée. Les refus et retours négatifs sont conservés.
- Le rapport exige une fenêtre explicite de 366 jours au plus, expose ses dénominateurs et ne revendique aucun gain d’apprentissage causal.

## Preuves exécutées

- La recette PostgreSQL `supabase/tests/s3_013_delivery_policy.sql` couvre plage globale, plage propre à la formation dans un autre fuseau, désactivation, aperçu, priorité, ouverture idempotente et indicateurs de parcours. Elle passe sur la base de production dans une transaction annulée et ne laisse aucune fixture.
- Les tests API et unitaires ciblés passent 21/21, dont le changement d’heure légale `Europe/Paris`.
- Au SHA fonctionnel `4137783fc20e7a6f2507469275b1fe92d0498718`, ServeurIA passe Prettier, TypeScript, ESLint, 549 fichiers et 3 382 tests Vitest, ainsi que le build de production de 127 pages.
- Après alignement des deux mocks de rapport sur les paramètres de période, le SHA final `0dda3300a595c5a3ab019518ca195d4b96907ca3` passe 197/197 scénarios Playwright sur ServeurIA.

## Résidu de validation

Le seul résidu propre à S3-013 est une recette sur appareil physique : notification reçue lorsque l’application est fermée, confidentialité de l’écran verrouillé, ouverture de la formation exacte et appréciation humaine du ton et de la pression. Ce résidu est partagé avec S3-012 et S3-014 ; il ne doit pas provoquer une nouvelle implémentation machine ni être remplacé par une preuve HTTPS.
