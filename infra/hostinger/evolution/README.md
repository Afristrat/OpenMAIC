# Evolution API dédiée à Qalem

Cette composition décrit l’instance WhatsApp de Qalem installée sur le VPS Hostinger, sans Coolify. Elle est distincte de toute instance appartenant à un autre produit.

## Cible persistante

- Répertoire serveur : `/opt/qalem-evolution`
- API locale : `127.0.0.1:8081`
- API publique : `https://evolution-qalem.ai-mpower.com`
- Instance logique : `qalem-reminders`
- Tunnel Cloudflare : ingress dédié vers `http://127.0.0.1:8081`
- Volumes nommés : `postgres-data` et `redis-data`

Le port Evolution n’est pas publié sur Internet directement. Cloudflare Tunnel constitue l’unique entrée publique.

## Secrets

Le fichier `.env` du serveur est créé avec le mode `0600` et n’est jamais versionné. Les valeurs applicatives correspondantes sont enregistrées dans le coffre global sous les noms suivants :

- `QALEM_EVOLUTION_API_URL`
- `QALEM_EVOLUTION_API_KEY`
- `QALEM_EVOLUTION_INSTANCE_NAME`

Le mot de passe PostgreSQL doit être une chaîne hexadécimale afin de rester valide sans échappement dans l’URI Prisma.

## Déploiement et contrôle

Copier `docker-compose.yml` dans `/opt/qalem-evolution`, créer `.env` depuis `.env.example` avec des valeurs générées localement sur le serveur, puis exécuter `docker compose up -d` depuis ce répertoire.

Avant toute validation :

1. vérifier les trois états `healthy` avec `docker compose ps` ;
2. vérifier un HTTP 200 sur l’API locale et l’URL publique ;
3. vérifier que l’instance `qalem-reminders` est `open` après appairage WhatsApp ;
4. ne jamais afficher la clé API, le QR d’appairage ni le contenu de `.env`.
