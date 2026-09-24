# S6-030 — Déploiement et amorçage mesuré du référentiel de crédits

## État certifié le 24 septembre 2026

Le SHA `826018fd0ecc605f7a039971eed9160e188b7447` est poussé sur
`origin/refork-v030` et servi par le web Qalem. Le déploiement Coolify
`3tuiylvsl1phqf4mfgbwcqo2` est terminé. Le conteneur correspondant est sain,
avec zéro redémarrage et `OOMKilled=false`. `https://qalem.ma/health` répond
HTTP 200 avec `{"status":"ok"}` et les journaux du nouveau conteneur ne
contiennent aucun `ERROR`, `Unhandled`, `FATAL` ou `OOM` dans la fenêtre de
contrôle.

La migration `20260923234500_global_credit_policy.sql` est appliquée à la base
Qalem après prévol transactionnel et sauvegarde. Elle fixe l'ancrage à un crédit
pour 0,01 USD de capacité de coût interne, rend les versions immuables, permet
les dérogations tenant et maintient le débit global suspendu tant que les huit
unités ne sont pas toutes calibrées.

## Mesure LiteLLM Qalem du 1er au 24 septembre

La lecture paginée des 762 journaux portant l'alias de la clé virtuelle Qalem
sépare 750 appels réussis et 12 échecs. Les échecs ont un coût nul et ne sont
pas intégrés au barème. Les huit appels `qwen3-14b-local` réussis sont également
écartés : ils appartiennent au banc de calibration et non au routage applicatif
Qalem.

| Modèle réellement appelé | Appels réussis | Jetons d'entrée | Jetons de sortie | Coût LiteLLM |
|---|---:|---:|---:|---:|
| Kimi K2.6 | 327 | 1 497 541 | 507 934 | 2,864061390 USD |
| DeepSeek V4 Pro | 311 | 1 505 573 | 295 865 | 1,869670528 USD |
| DeepSeek V4 Flash | 86 | 309 199 | 83 968 | 0,176966764 USD |
| Gemini 3.1 Flash Image | 13 | 3 708 | 19 905 | 0,891489000 USD |
| Gemini 2.5 Flash Image | 2 | 28 | 2 591 | 0,077435900 USD |
| **Total cloud valorisé** | **739** | | | **5,879623582 USD** |

Les trois appels ASR locaux réussis remontent encore un coût LiteLLM nul. Ce
zéro est traité comme une absence de valorisation, pas comme un coût réel nul.

Les quinze générations d'image réussies ont un coût unitaire compris entre
0,0387051 et 0,0694915 USD. Leur médiane est 0,0684565 USD et leur percentile
95 observé est 0,0694915 USD.

## Taux globaux amorcés

Trois taux sur huit sont maintenant actifs dans le référentiel global :

| Unité | Taux | Base | Justification |
|---|---:|---:|---|
| Jeton LLM d'entrée | 95 microunités de crédit | 1 jeton | coût unitaire maximal du catalogue Qalem actif : Kimi K2.6 à 0,95 USD par million |
| Jeton LLM de sortie | 400 microunités de crédit | 1 jeton | coût unitaire maximal du catalogue Qalem actif : Kimi K2.6 à 4 USD par million |
| Image | 6 949 150 microunités de crédit | 1 image | percentile 95 des quinze coûts réels Qalem observés |

L'écriture des trois versions a été transactionnelle. La base relit trois taux
globaux actifs et zéro contrôle tenant actif. Aucun solde, y compris celui de
Human Yo Impact, n'est donc débité par un référentiel encore incomplet.

## Attribution Higgs

Higgs Audio est exclusivement utilisé par Qalem. Son amortissement, son énergie
et son occupation sont donc imputables à 100 % à Qalem, sans clé de répartition
avec un autre projet. Les 801 appels observés du 1er au 23 septembre restent
attribuables à la flotte Qalem ; le détail par tenant et formation n'existe pas
dans les anciens journaux. Le nouveau comptage Qalem transporte désormais le
tenant, l'acteur et l'opération pour les usages futurs.

Cette exclusivité ne suffit pas à inventer un coût par seconde : le taux TTS
reste ouvert jusqu'à la mesure de l'énergie et à la fixation de la règle
d'amortissement. La même discipline s'applique à l'ASR, à la vidéo, au stockage
et aux opérations. L'ajout du huitième taux activera atomiquement les contrôles
système ; aucune activation partielle n'est permise.

## Restes de clôture

- mesurer et versionner TTS, ASR, vidéo, stockage et opération ;
- rendre le ledger personnel visible dans une page accessible aux membres, pas
  seulement dans l'administration de l'organisation ;
- exécuter la recette Human Yo Impact : débit unique, auteur, rejeu idempotent,
  remboursement d'échec et visibilité super-administrateur/administrateur/membre ;
- exécuter les parcours Playwright correspondants au SHA de clôture.
