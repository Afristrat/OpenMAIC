# S6-011 — Canaux de rappel e-mail et WhatsApp

Date de preuve : 2026-09-06
SHA fonctionnel et déployé : `6f13b77167f6f589c1bc938f32a6439879a0e9bc`

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
- Une instance Evolution API v2.3.7 strictement dédiée à Qalem est déployée dans `/opt/qalem-evolution` sur Hostinger. PostgreSQL et Redis utilisent deux volumes nommés persistants ; les trois conteneurs sont sains. L’API n’écoute que sur `127.0.0.1:8081` et le tunnel Cloudflare publie `https://evolution-qalem.ai-mpower.com`, qui répond 200.
- Le manifeste reproductible `infra/hostinger/evolution/docker-compose.yml` a le même SHA-256 (`a9380df6023e843b5567190697b4f22a5a578898bfb1d9e2085ab0933cc0d417`) que le fichier actif sur Hostinger et passe `docker compose config --quiet`.
- La clé, l’URL et le nom `qalem-reminders` sont enregistrés dans le coffre puis injectés dans le web, le worker et le capture-worker. Les longueurs effectives sont 37/64/15 ; aucune valeur n’est exposée.
- Les déploiements Coolify `cws0usd5jn3kds57vjr21kq2` et `jjohw6g4999wtylp1mo5oc88` sont terminés au SHA exact. Les trois conteneurs sont healthy, avec zéro redémarrage et `OOMKilled=false`; Qalem et Evolution répondent 200.
- La première recette e-mail a révélé un `403` Resend : `SMTP_FROM` utilisait `afriquestrategie.com`, domaine non vérifié dans ce compte. La cause racine est corrigée avec une configuration propre à Qalem sur le domaine vérifié `ai-mpower.com`, sans modifier l’expéditeur global des autres projets.
- La recette e-mail de production utilise l’adresse contrôlée `delivered+…@resend.dev` documentée par Resend. Elle obtient une seule livraison après rejeu du claim, `status=sent`, zéro tentative d’échec, l’événement fournisseur `delivered`, puis une désinscription effective. Préférences, livraison, carte et compte temporaires sont supprimés avec trois compteurs à zéro.
- Le gate exact du nouveau SHA est vert avec `NODE_OPTIONS=--max-old-space-size=4096` : Prettier, TypeScript, ESLint, 439/439 fichiers et 2 697/2 697 tests Vitest, build de 113 pages, puis 112/112 tests Playwright. La première exécution sans ce plafond avait atteint uniquement la limite V8 de 2 Gio ; le conteneur de validation n’a subi ni OOM noyau ni redémarrage.

## Validation finale du 26 septembre 2026

- L’instance logique `qalem-reminders` est appairée et l’API Evolution retourne
  `state=open`.
- Un envoi fournisseur contrôlé a été reçu sur le téléphone d’Amine.
- Une carte de révision temporaire due a ensuite traversé le pipeline Qalem réel :
  claim Supabase, file BullMQ, worker, Evolution et téléphone. La livraison porte
  `status=sent`, zéro tentative d’échec, aucun code d’erreur et un identifiant
  fournisseur.
- Amine a confirmé la réception du second message. Son lien a ouvert la file
  d’attente des notifications puis la carte du programme.
- Le rejeu du claim le même jour a retourné zéro nouvelle livraison.
- Après désactivation de l’e-mail et de WhatsApp et suppression du numéro, un
  claim au jour suivant a retourné zéro livraison. Cette preuve exerce la
  désinscription indépendamment de l’unicité du lot du jour courant.
- Les préférences initiales ont été restaurées exactement : e-mail actif,
  WhatsApp inactif, aucun numéro, locale `fr-FR`, fuseau `UTC`, plafond quotidien
  de trois et aucun silence ni report programmé.
- La carte, la livraison et le job BullMQ temporaires ont été supprimés. Les
  contrôles finaux retournent zéro carte et zéro livraison de recette.

S6-011 satisfait désormais l’appairage, l’opt-in, la réception réelle, la
navigation du lien, la déduplication, la désinscription et le nettoyage ; elle
passe à `completed/passes=true`.

## Incident d’appairage et correction du 26 septembre 2026

Une lecture initiale de l’API Evolution dédiée retournait HTTP 200 pour
`qalem-reminders` et l’endpoint d’appairage générait un PNG valide. Ce prévol
était insuffisant : le premier scan physique a échoué, tandis que les journaux
répétaient `redis disconnected`.

Redis lui-même était sain (`PONG`), résolu sur le réseau Docker et joignable en
TCP depuis Evolution. La cause se trouvait dans la composition : elle passait
`REDIS_URI`, variable ignorée par Evolution v2.3.7. L’image appliquait donc son
défaut `CACHE_REDIS_URI=redis://localhost:6379/6` et cherchait Redis dans son
propre conteneur.

La composition versionnée et active déclare désormais le cache avec
`CACHE_REDIS_URI=redis://redis:6379/6`, un préfixe propre à Qalem et le cache
local désactivé. Le déploiement n’a recréé que `qalem-evolution-api`, sans
toucher aux volumes ni aux conteneurs PostgreSQL et Redis. Après redémarrage,
le runtime relit l’hôte `redis`, l’API locale et l’URL publique répondent HTTP
200, le conteneur affiche `restart=0` et `OOMKilled=false`, et aucune nouvelle
déconnexion Redis n’apparaît. Un nouveau QR valide est généré pour la reprise du
test humain.

Après la recette finale, les six images QR expirées ont été supprimées. La
sauvegarde de composition antérieure a également été supprimée uniquement après
égalité du SHA-256 entre le manifeste actif Hostinger et le manifeste versionné
`ff337723b4b46a4811a1c1b4674e67f1ca93d22c`.
