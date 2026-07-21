# Protection des ressources de production

## Périmètre prouvé

Mesure effectuée le 21 juillet 2026 sur `serveuria-MS-7D98` : 28 CPU, 62,5 Gio de RAM, 24,8 Gio disponibles au moment de l’audit. Les 231 conteneurs actifs consommaient environ 30,7 Gio. Les conteneurs dont l’appartenance à Qalem a été vérifiée consommaient environ 3 Gio au repos.

Le périmètre Qalem comprend l’application web, le worker BullMQ, le worker Playwright, `qalem-redis` et le service Coolify `supabase-qalem`. Les fournisseurs LiteLLM, Crawl4AI, Mishkāt et les services exécutés sur les DGX sont partagés ou externes : ils ne sont pas plafonnés par ce projet. Leur admission est bornée côté Qalem par une concurrence lourde globale de 1.

## Budget

| Service | Limite mémoire | Réservation | CPU | PIDs |
|---|---:|---:|---:|---:|
| Web Qalem | 1,5 Gio | 384 Mio | 2 | 256 |
| Workers BullMQ | 3 Gio | 768 Mio | 3 | 512 |
| Capture Playwright | 1,5 Gio | 384 Mio | 1,5 | 256 |
| Redis Qalem | 512 Mio | 128 Mio | 0,75 | 64 |
| Supabase Qalem, ensemble | environ 10,7 Gio | environ 3,2 Gio | plafonds par service | plafonds par service |

Le plafond cumulé est d’environ 17 Gio. Par rapport à l’état mesuré, même une montée simultanée jusqu’à tous les plafonds conserve plus de 12 Gio de marge sur l’hôte. Les plafonds sont des limites, pas des réservations : ils n’immobilisent pas cette mémoire lorsqu’elle n’est pas utilisée.

## Admission des travaux lourds

Les générations de classroom, capsules vidéo, vidéos gérées et exports passent par Redis et BullMQ. Les paramètres de la génération de classroom sont persistés dans Supabase avant l’enfilement ; aucune clé de recherche fournie par un client n’est persistée. Un permis partagé limite l’ensemble des travaux lourds à une exécution par processus, et le déploiement maintient un seul processus worker.

Le worker Playwright accepte une seule capture à la fois, refuse les requêtes excédentaires avec `429`, borne le plan d’interaction et ferme Chromium après 60 secondes. La génération de classroom n’est plus lancée par `after()` dans le processus HTTP.

Redis utilise AOF avec `appendfsync everysec`, la politique `noeviction` et une mémoire interne inférieure à sa limite cgroup. PostgreSQL est borné à 512 Mio de `shared_buffers`, 1,5 Gio d’`effective_cache_size`, 8 Mio de `work_mem`, 256 Mio de `maintenance_work_mem` et 100 connexions.

## Sources de configuration

Le déploiement autonome complet est décrit dans `docker-compose.production.yml`. Les limites de la Supabase gérée par Coolify sont reproduites dans `infra/coolify/supabase-resource-limits.yml` et doivent être fusionnées dans le compose du service `supabase-qalem` avant redéploiement.

## Dette planifiée — semaine du 27 juillet 2026

**Objet :** réduire le plafond cumulé Qalem après mesure des pics réels, sans diminuer les limites à l’aveugle.

Nouvelle mesure au repos effectuée le 21 juillet 2026 : environ 3,55 Gio consommés par Qalem, dont 1,57 Gio par Kong et 523 Mio par Supabase Analytics. L’hôte conservait 24,1 Go disponibles. Le plafond actuel de 17,1 Gio est donc protecteur, mais surdimensionné pour la charge observée.

**Plafond temporairement accepté :** 17,1 Gio jusqu’au test de charge. **Cible indicative, non encore validée :** environ 12 Gio.

**Déclencheur de réexamen :** semaine du 27 juillet 2026, ou plus tôt si la mémoire disponible de l’hôte passe sous 12 Gio, si un conteneur Qalem subit un OOM, ou si son compteur de redémarrages augmente.

**Critères de sortie :**

1. Exécuter simultanément une génération complète de classroom, une capture Chromium, une génération vidéo et un export.
2. Mesurer les pics RAM, CPU et PIDs par conteneur pendant toute l’exécution.
3. Expliquer la consommation au repos de Kong avant toute baisse de son plafond.
4. Fixer chaque nouvelle limite au-dessus du pic mesuré avec 30 à 50 % de marge selon la volatilité du service.
5. Valider les composes, redéployer et prouver les limites par `docker inspect`, sans OOM ni redémarrage.
