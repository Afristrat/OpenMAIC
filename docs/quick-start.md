# Qalem — Déploiement en 15 minutes

> Ce guide vous amène d'un serveur vierge à une instance Qalem fonctionnelle.
> Pour la configuration avancée, voir [self-hosted.md](./self-hosted.md).

## Pré-requis

- Un serveur Linux (Ubuntu 22.04+, Debian 12+) avec **4 Go RAM** minimum
- Docker et Docker Compose installés
- Un nom de domaine (optionnel mais recommandé)
- Au moins une clé API LLM (Anthropic, OpenAI, ou Google)

## Étape 1 — Cloner et configurer (5 min)

```bash
git clone https://github.com/your-org/qalem.git
cd qalem

# Le script génère automatiquement les secrets (JWT, PostgreSQL, MinIO)
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Le script va :
1. Copier `.env.docker.example` → `.env.local`
2. Générer des mots de passe sécurisés pour PostgreSQL, MinIO et JWT
3. Générer les clés Supabase (anon + service role)
4. Vous demander vos clés API LLM

**Minimum requis** : une seule clé API LLM. Recommandé : `GOOGLE_API_KEY` (Gemini 3 Flash = meilleur rapport qualité/prix).

## Étape 2 — Configurer les clés API (3 min)

Éditez `.env.local` et ajoutez au minimum :

```bash
# AU MOINS UNE de ces clés :
GOOGLE_API_KEY=votre-clé-ici        # Recommandé
ANTHROPIC_API_KEY=sk-ant-...         # Optionnel
OPENAI_API_KEY=sk-...                # Optionnel

# TTS (optionnel mais recommandé pour les voix naturelles) :
TTS_ELEVENLABS_API_KEY=votre-clé    # Voix FR/AR naturelles
```

## Étape 3 — Lancer (5 min)

```bash
docker compose -f docker-compose.production.yml up -d
```

Attendez que tous les services soient sains :

```bash
docker compose -f docker-compose.production.yml ps
```

Tous les services doivent afficher `healthy` ou `running`.

## Étape 4 — Vérifier (2 min)

Ouvrez votre navigateur : **http://votre-serveur:3000**

Vous devriez voir la page d'accueil Qalem en français avec :
- Le sélecteur de langue (FR / AR / EN)
- Le champ de saisie pour décrire un cours
- Les 3 cours de démo pré-chargés

## C'est terminé !

### Premiers pas recommandés

1. **Tester un cours de démo** — Cliquez sur un des cours pré-chargés
2. **Créer votre premier cours** — Tapez un sujet (ex: "Introduction au marketing digital pour entrepreneurs marocains") et cliquez "Entrer en classe"
3. **Configurer l'authentification** — Allez dans Paramètres → ajoutez vos clés OAuth Google/GitHub
4. **Inviter des utilisateurs** — Créez une organisation et invitez par email

### Commandes utiles

```bash
# Voir les logs
docker compose -f docker-compose.production.yml logs -f qalem

# Redémarrer après modification de .env.local
docker compose -f docker-compose.production.yml restart qalem

# Arrêter tout
docker compose -f docker-compose.production.yml down

# Mettre à jour
git pull && docker compose -f docker-compose.production.yml up -d --build
```

### Reverse proxy (recommandé pour la production)

Pour HTTPS avec un nom de domaine, ajoutez Nginx devant :

```nginx
server {
    listen 443 ssl;
    server_name qalem.votre-domaine.ma;

    ssl_certificate /etc/letsencrypt/live/qalem.votre-domaine.ma/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qalem.votre-domaine.ma/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (pour le streaming MCP et la génération)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

### Support

- Documentation complète : [self-hosted.md](./self-hosted.md)
- Problème ? Vérifiez les logs : `docker compose logs qalem | tail -50`
