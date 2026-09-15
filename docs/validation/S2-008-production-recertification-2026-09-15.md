# S2-008 — Recertification production AudioSeal

Date : 15 septembre 2026

Runtime : `a14gf0n3u719hnnd2yujrtmr` au SHA `d0de1a062142b8a99d963985ab6f1fe668d9b5fd`.

## Sidecar et bornes

Le sidecar AudioSeal est déployé dans le runtime Qalem, sans port hôte. Il est accessible uniquement depuis le worker à `http://audioseal-sidecar:8080`. Le modèle attesté est `audioseal_wm_16bits`, la limite est de 180 secondes, et le conteneur est borné à 3 Gio, 1,5 CPU et 128 PID.

Le healthcheck vérifie le processus, non une requête HTTP concurrente : une inférence volontairement séquentielle ne peut donc plus entraîner un faux état dégradé. La disponibilité du modèle est contrôlée séparément depuis le worker par `GET /health` : HTTP 200, `ok=true`.

## P2-C réel

La fixture officielle AudioSeal `test.wav`, répétée à 50 secondes, a été traitée par le sidecar de production. L’identifiant composite `0123456789abcdef0123456789abcdef` est reconstitué avec 11 segments dans chacune des cinq variantes : MP3 produit, MP3 128 kbit/s, OGG, normalisation `loudnorm` et extrait décalé de 30 secondes.

Pendant le harnais, le sidecar a culminé à 679 Mio, sans OOM ni redémarrage. Les empreintes des variantes sont conservées dans le journal de recette système ; aucun extrait audio n’est conservé.

## Transmission authentifiée

Avec `watermarking=true`, deux comptes techniques, un tenant de deux membres et une scène ont été créés temporairement. Une transmission privée a traversé la file audio puis la file visuelle.

| Contrôle | Résultat |
| --- | --- |
| Statut final | `done` |
| Identifiant opaque | `21cacad3f30c6e404832cf063bb19643` |
| Source inchangée | oui, SHA-256 `1b5180a1f78ab5adf73e33bbf4fa274c310a4abe37a5dc9192c0c4883d98ea98` |
| Audio AudioSeal | 1 003 004 octets, SHA-256 `dc8e4533937df21c10015fea66295d8082d37bebcd18bcdcd291800852ec785c` |
| Dérivée visuelle | 3 178 081 octets, 640 × 360, piste audio présente |

Les comptes, tenant, scène, transmission, objets Storage et jobs BullMQ temporaires ont été recomptés à zéro. Worker, sidecar et capture-worker sont `healthy`, avec `RestartCount=0` et `OOMKilled=false`.

## Limite explicite

AudioSeal établit une provenance audio par destinataire. Il ne constitue ni DRM ni blocage de lecture sur une autre plateforme. Le contrôle de diffusion locale reste traité séparément par S2-012.
