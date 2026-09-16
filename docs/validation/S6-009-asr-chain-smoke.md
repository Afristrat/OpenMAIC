# S6-009 — Contrôle de chaîne ASR du 12 septembre 2026

## Résultat borné

Depuis le conteneur web Qalem en cours d’exécution, l’appel OpenAI-compatible
vers la configuration ASR administrée a reçu HTTP 200 pour un WAV de silence
PCM mono de une seconde. La mesure interne est de 678 ms. L’URL configurée est
HTTPS et son hôte n’appartient à aucune des plages privées contrôlées
(`localhost`, boucle locale, `10/8`, `172.16/12`, `192.168/16`).

La commande n’a affiché ni URL, ni modèle, ni clé, ni corps de réponse. Elle
prouve uniquement la connectivité runtime Qalem vers le relais ASR configuré,
avec un format WAV accepté. Elle ne prouve pas la qualité de transcription,
la chaîne microphone de navigateur, la réception par LiteLLM Hostinger ou
l’exécution finale sur DGX.

## Dette de validation conservée

S6-009 reste ouverte jusqu’à la recette authentifiée suivante :

1. extraits de parole humaine autorisée FR, arabe et EN, courts et longs,
   avec transcriptions de référence ;
2. mesure d’erreur et de latence par langue ;
3. microphone physique, refus de permission, fichier invalide et panne amont ;
4. preuve de bout en bout Qalem → LiteLLM Hostinger → tunnel Cloudflare → DGX,
   sans endpoint LAN ;
5. acceptation humaine explicite des résultats, sans confusion avec le TTS.

Les jeux de données Mozilla Common Voice publiés sous CC0 peuvent fournir des
échantillons autorisés, sous réserve de leur procédure d’accès et sans les
repartager dans le dépôt. Source : https://commonvoice.mozilla.org/en/datasets

## Contrôle de topologie du 14 septembre 2026

Le conteneur Qalem actif charge une configuration ASR, en HTTPS, dont l’hôte
est non privé. L’appel authentifié à son endpoint de modèles répond HTTP 200 et
présente trois modèles ASR. Hostinger est accessible ; le conteneur LiteLLM y
est `healthy`. En revanche, l’endpoint LiteLLM interrogé avec la clé virtuelle
Qalem répond HTTP 200 mais n’expose aucun modèle dont l’identifiant correspond
à Whisper, ASR ou transcription.

Cette observation prouve le relais ASR public configuré par Qalem et la santé
de LiteLLM séparément. Elle ne prouve pas Qalem → LiteLLM → Cloudflare → DGX ;
au contraire, elle impose de réconcilier le routage avant toute certification
de cette chaîne.

## Routage LiteLLM réconcilié le 14 septembre 2026

LiteLLM dispose de trois modèles ASR. La clé virtuelle Qalem autorisait
initialement dix-sept modèles, sans aucun ASR. Les dix-sept autorisations ont
été conservées et les trois modèles ASR ont été ajoutés, soit vingt modèles
autorisés. Les variables ASR des variantes production et prévisualisation de
Qalem Runtime ont été remplacées par la base LiteLLM et cette clé virtuelle,
puis le déploiement Coolify `zehz6jlpuglgwlaqaxzlqbbl` a terminé.

Après déploiement, Qalem répond HTTP 200, worker et capture-worker sont
`healthy`, sans OOM ni redémarrage. Depuis le capture-worker, les trois modèles
ASR exposés par LiteLLM ont chacun accepté un WAV de silence PCM d’une seconde,
avec des latences comprises entre 461 et 584 ms. Aucun texte transcrit ni
configuration sensible n’a été conservé.

Cette preuve établit Qalem → LiteLLM et l’exécution d’un appel audio sur les
trois modèles. Elle ne remplace pas les extraits humains FR/AR/EN, le parcours
microphone, l’acceptation humaine ou l’attestation explicite LiteLLM →
Cloudflare → DGX.

## Attestation Cloudflare non disponible le 14 septembre 2026

Deux jetons Cloudflare actifs ont été interrogés en lecture seule, sans
afficher leur valeur ni celle d’un compte. Le jeton rattaché à Qalem ne voit
aucun compte. Le jeton du hub voit un compte, mais ne retrouve pas l’UUID du
tunnel référencé par la configuration Qalem. La valeur de configuration
référencée n’est pas un document JSON et ne contient ni cet UUID, ni une
déclaration `ingress` ou `service` exploitable.

Ce contrôle ne démontre pas l’absence de tunnel : il démontre qu’aucun des
droits actuellement disponibles ne permet d’attester sa configuration ou ses
connecteurs. La preuve LiteLLM → Cloudflare → DGX reste donc indisponible ;
elle exige un jeton Cloudflare ayant au minimum accès en lecture au compte et
au tunnel réellement exploités, ou une preuve équivalente produite depuis
l’administration Cloudflare. Aucune mutation Cloudflare n’a été effectuée.

## Réconciliation Tailscale du 16 septembre 2026

Cloudflare n’est plus un maillon retenu pour l’exécution ASR : la topologie
cible est Qalem → LiteLLM Hostinger → DGX par Tailscale. Depuis Hostinger, le
daemon Tailscale est `Running` et les deux pairs DGX ont répondu à trois pings
chacun : 45 ms répétés vers le premier, puis 67 à 127 ms vers le second, via
les relais DERP. Une connexion directe n’a pas été établie pendant cet essai,
mais le transport chiffré Tailscale était fonctionnel.

La clé virtuelle Qalem, interrogée auprès de LiteLLM, expose exactement les
trois modèles ASR `qwen3-asr`, `whisper-1` et `whisper-large-v3`. Le conteneur
LiteLLM Hostinger est healthy. La lecture de ses trois routes confirme une
`api_base` configurée pour chacune ; chacune résout toutefois vers un DNS
public, et non vers l’un des deux pairs DGX ni vers une adresse Tailscale. La
connectivité Hostinger→DGX par Tailscale est donc prouvée, mais elle n’est pas
encore le chemin de dispatch actif de LiteLLM. Aucune mutation n’a été faite
sur ce routage tant que le port et le contrat HTTP du service ASR DGX ne sont
pas établis.

Restent explicitement ouverts : le basculement vérifié des trois routes
LiteLLM vers le backend DGX par Tailscale, une trace de dispatch non sensible,
le microphone physique avec ses pannes réelles, et l’acceptation humaine des
mesures de transcription. S6-009 demeure donc à valider.

## Routage LiteLLM → DGX rétabli le 16 septembre 2026

Le diagnostic du pair DGX a établi que le conteneur `asr` utilise le réseau de
l’hôte et que son API FastAPI écoute sur le port `8003` : `/health` et
`/v1/audio/transcriptions` répondent. Le port `7860` déclaré dans l’image ne
correspondait pas au service réellement actif. Depuis Hostinger, l’état de
santé et une transcription WAV de contrôle vers l’adresse Tailscale du DGX
répondent tous deux HTTP 200.

Les trois enregistrements LiteLLM (`qwen3-asr`, `whisper-1` et
`whisper-large-v3`) ont ensuite été basculés vers cette racine Tailscale avec
le préfixe `/v1`, puis LiteLLM a été redémarré et est redevenu healthy. Une
transcription de contrôle, exécutée depuis le conteneur LiteLLM sans extraire
de clé, répond HTTP 200 pour chacun des trois modèles. Les routes persistantes
ne résolvent donc plus vers le DNS public constaté dans la section précédente.

Cette preuve établit désormais le dispatch LiteLLM Hostinger → DGX par
Tailscale et élimine Cloudflare du chemin ASR. Restent les critères qui ne
peuvent pas être substitués par cette recette serveur : microphone physique,
refus de permission, panne amont visible dans l’interface et acceptation
humaine des mesures FR/arabe standard/EN.
