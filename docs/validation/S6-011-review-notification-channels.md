# S6-011 — Canaux de rappel e-mail et WhatsApp

Date de preuve : 2026-09-04
SHA fonctionnel et déployé : `cea34e0084d92510b42b68f4f904069ac70b87c2`

## Décision produit

ADR-008 conserve l’e-mail et WhatsApp uniquement pour les cartes de révision historiques. Le parcours ANCRER conserve le Web Push et ne promet pas ces deux canaux.

## Preuves acquises

- Les préférences e-mail et WhatsApp sont des opt-in explicites et révocables ; aucun canal n’est actif par défaut.
- La migration `00070_review_notification_channels.sql` crée les préférences, le registre de livraison quotidien, la déduplication par utilisateur/canal/jour et les RPC réservées au rôle de service. Elle a passé une transaction annulée, puis a été appliquée durablement à la base Qalem de production.
- Le worker regroupe les cartes dues en un seul rappel par canal et par jour. Resend utilise une clé d’idempotence et une reprise bornée. WhatsApp ne rejoue pas automatiquement une erreur réseau ambiguë, l’API Evolution ne fournissant pas de contrat d’idempotence équivalent.
- Les retours d’échec enregistrent uniquement des codes bornés ; aucune adresse, aucun numéro ni secret fournisseur n’est journalisé.
- Le gate exact du SHA est vert : Prettier, TypeScript, ESLint, 435/435 fichiers et 2 681/2 681 tests Vitest, build de production, puis 110/110 tests Playwright sans reprise.
- Le web Coolify sert l’image `bcx5pxyuc9z3lt4jtyjipcqu:cea34e0084d92510b42b68f4f904069ac70b87c2`, est healthy et `/api/health` répond 200.
- Le déploiement runtime Coolify `agigrjbydu9qdzkxew68td6m` est terminé sur le même SHA. `qalem-workers` et `capture-worker` sont healthy, avec zéro redémarrage et `OOMKilled=false`.
- Le worker confirme `RESEND_API_KEY` et `SMTP_FROM` configurés à l’exécution et démarre la file BullMQ `review-notification`.

## Validation encore ouverte

- Effectuer un envoi e-mail autorisé vers une adresse de recette et en constater la réception.
- Créer ou attribuer à Qalem une instance Evolution dédiée, puis enregistrer `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` et `EVOLUTION_INSTANCE_NAME` dans le runtime.
- Effectuer un envoi WhatsApp autorisé vers un numéro de recette ayant explicitement accepté ce canal et en constater la réception.
- Vérifier sur les deux canaux la désinscription et l’absence de second envoi dans la même journée.

Ces éléments empêchent `passes=true`. Ils ne constituent plus un manque de code : la story passe à `to_validate`.
