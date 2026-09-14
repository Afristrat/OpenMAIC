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
