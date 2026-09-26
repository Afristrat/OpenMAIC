# S6-030 — Déploiement et amorçage mesuré du référentiel de crédits

## État certifié le 24 septembre 2026

Le candidat de clôture est le SHA
`9a486f94e6d7ed90b2b5ba3f2c786e340032195a`, poussé sur
`origin/refork-v030`. Le déploiement Coolify
`h65r8qh88ev4syf9b7j5qbe6` est terminé. Le conteneur
`bcx5pxyuc9z3lt4jtyjipcqu-091001989287` sert exactement ce SHA, est sain, n’a
subi aucun redémarrage et porte `OOMKilled=false`. L’API publique de santé
répond HTTP 200 avec `{"status":"ok"}` et les journaux contrôlés ne
contiennent aucun `ERROR`, `Unhandled`, `FATAL` ou `OOM`.

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

## Taux globaux actifs

Les huit taux exigés sont actifs dans le référentiel global :

| Unité | Taux | Base | Justification |
|---|---:|---:|---|
| Jeton LLM d'entrée | 95 microunités de crédit | 1 jeton | coût unitaire maximal du catalogue Qalem actif : Kimi K2.6 à 0,95 USD par million |
| Jeton LLM de sortie | 400 microunités de crédit | 1 jeton | coût unitaire maximal du catalogue Qalem actif : Kimi K2.6 à 4 USD par million |
| Image | 6 949 150 microunités de crédit | 1 image | percentile 95 des quinze coûts réels Qalem observés |
| TTS Higgs | 27 000 microunités de crédit | 1 seconde audio | amortissement conservateur du DGX, temps de calcul mesuré et énergie mesurée, arrondis vers le haut |
| ASR Whisper | 7 000 microunités de crédit | 1 seconde audio | six mesures FLEURS de production recoupées avec deux transcriptions fraîches sur le DGX1 |
| Vidéo LTX-2 | 3 000 000 microunités de crédit | 1 seconde vidéo | trois générations réelles, amortissement DGX2 et énergie mesurée, arrondis conservateurs |
| Stockage | 27 600 microunités de crédit | 1 000 000 octets envoyés | équivalent de remplacement S3 Standard sur douze mois à 0,023 USD/Go-mois ; horizon explicite, coût MinIO réel suivi séparément |
| Opération | 100 000 microunités de crédit | 1 opération | coût Serper observé de 0,001 USD ; les opérations Brave à coût nul ne ramènent pas le barème global à zéro |

L'écriture de chaque version est transactionnelle. L'ajout du huitième taux le
24 septembre a activé atomiquement les quatre contrôles de tenants actifs. La
base relit huit taux globaux actifs et quatre contrôles actifs sur quatre. Human
Yo Impact conserve exactement son allocation de 1 000 crédits avant première
consommation sous ce référentiel ; aucun solde existant n'a été réécrit.

## Attribution Higgs

Higgs Audio est exclusivement utilisé par Qalem. Son amortissement, son énergie
et son occupation sont donc imputables à 100 % à Qalem, sans clé de répartition
avec un autre projet. Les 801 appels observés du 1er au 23 septembre restent
attribuables à la flotte Qalem ; le détail par tenant et formation n'existe pas
dans les anciens journaux. Le nouveau comptage Qalem transporte désormais le
tenant, l'acteur et l'opération pour les usages futurs.

Une sonde fraîche sur le DGX Higgs a produit 14,38 secondes audio en 17,350723
secondes écoulées, avec 85,93 % d'utilisation GPU. La puissance moyenne mesurée
est de 12,2295 W au repos et 26,721408 W en charge, soit 0,069845856 Wh nets et
0,004857153 Wh par seconde audio. Recoupée avec la recette de production de
37 segments, 447,08 secondes audio et 552 secondes écoulées, cette mesure donne
25 827 microunités de crédit par seconde avant électricité, sur la règle
d'amortissement de 4 699 USD sur trois ans et 2 080 heures productives par an.
Le taux est arrondi à 27 000 microunités : il couvre encore l'énergie à un prix
théorique de 2 USD/kWh, très supérieur au besoin de la mesure.

## ASR, vidéo, stockage et opération

Whisper `large-v3-turbo` a transcrit 31,66 secondes en 1,079504 seconde puis
6 secondes en 0,350961 seconde, avec réponses HTTP 200. Ces deux sondes
fraîches recoupent six mesures FLEURS de production de 6 à 16,38 secondes. La
puissance moyenne relevée passe de 16,1885 W au repos à 19,2325 W en charge.
Le taux conservateur retenu est de 7 000 microunités de crédit par seconde audio.

La vidéo Qalem échouait réellement en HTTP 401 : le sidecar ComfyUI acceptait
uniquement le secret Tamkin alors que son code prévoyait déjà un secret Qalem
distinct. Le fichier persistant du DGX2 conserve désormais les deux secrets ;
leurs valeurs ne sont ni fusionnées ni exposées. Le sidecar et le conteneur web
Qalem obtiennent tous deux HTTP 200 sur la santé LTX-2. Une génération fraîche
a produit 49 images à 24 images par seconde, soit 2,0416667 secondes de vidéo
et 304 844 octets, en 262,679 secondes. Deux travaux antérieurs comparables
avaient pris 136,365273 et 133,706666 secondes. La mesure énergétique fraîche
donne 12,201 W au repos, 39,851947 W en moyenne pendant la charge et
2,254949045 Wh nets. Le taux de 3 000 000 microunités par seconde vidéo couvre
amortissement et énergie avec une enveloppe conservatrice.

Le stockage est réglé une fois à l'envoi, et non mensuellement. Son taux encode
donc explicitement une conservation de douze mois : 0,023 USD par Go-mois,
soit 0,276 USD par Go décimal-an et 27 600 microunités de crédit par million
d'octets. Il s'agit d'un coût de remplacement documenté, pas d'une affirmation
sur la facture du MinIO souverain. La source primaire décrit une facturation en
fonction de la taille, de la durée mensuelle et de la classe de stockage :
<https://aws.amazon.com/s3/pricing/>.

Le taux d'opération est de 100 000 microunités, soit 0,1 crédit pour le coût
Serper observé de 0,001 USD. Une opération fournisseur échouée libère sa
réservation et n'est pas débitée.

## Cohérence du forfait gratuit

La base de production conservait encore l'ancienne contrainte qui excluait le
forfait gratuit, bien que la migration `00075_free_plan_three_courses.sql` soit
déjà présente dans le dépôt. Une sauvegarde complète a été créée avant son
application, avec l'empreinte SHA-256
`9c69ec7268674d533388a7d032566b6312e50b8ab59d4aa4b951f78ffdd50dd8`.
Après application, `free` est la valeur par défaut et Human Yo Impact est relu
`free`, actif, avec trois cours : son plafond gratuit est donc atteint sans
supprimer ni réécrire aucun cours.

## Recette réelle Human Yo Impact

Le script permanent `scripts/validation/s6-030-production-recipe.mjs` exécute
la recette uniquement après confirmation explicite de la cible production. Il
ne contient aucun secret et crée ses sessions depuis les variables injectées
par le coffre.

La recette finale
`s6030-1790214961228-562070e8-2b4b-48d8-9b1c-9b66e9c3f6e7` a exécuté une
recherche Serper réelle sous Human Yo Impact : HTTP 200, huit sources et débit
de 0,1 crédit. Le solde est passé de 999,8 à 999,7 crédits. Le règlement est
unique ; son rejeu retourne `applied=false`. L’usage reste visible avec
`pending_configuration` et la cause exacte `SELL_PRICE_NOT_FOUND`, car aucun
prix à la valeur n’est inventé depuis le coût.

Une réservation séparée simulant l’échec du fournisseur a été libérée : les
100 000 microunités réservées ont été intégralement remboursées, le solde a été
restauré et le rejeu de la libération retourne `applied=false`. Les trois
appels Serper réels réalisés pendant la mise au point expliquent le solde final
de 999,7 crédits ; aucune correction artificielle n’a effacé ces consommations.

Les vues API et navigateur ont été vérifiées avec trois rôles :

- l’administrateur Human Yo Impact voit le ledger du tenant ;
- le super-administrateur voit le même périmètre tenant sans devenir membre ;
- l’apprenant temporaire ne voit que son périmètre personnel, avec zéro écriture
  appartenant à un autre acteur.

Après recette, l’utilisateur et le membership temporaires sont absents, aucun
apprenant de recette ne subsiste et le portefeuille et le ledger relisent tous
deux 999 700 000 microunités.

## Gate de clôture

Sur ServeurIA, le candidat de clôture passe :

- TypeScript et le build Next.js de production de 127 pages ;
- 544 fichiers et 3 360 tests Vitest ;
- les tests ciblés du téléchargement privé et du ledger ;
- 194 scénarios Playwright sur un seul worker, sans échec, en 5 min 42 s.

Le parcours navigateur couvre notamment la visibilité du profil dans les trois
langues, l’administration des tenants, les exports MP4/PPTX/SCORM/cmi5, les dix
agents canoniques, les invitations, l’isolation des observations et les
parcours Director/xAPI. Le téléchargement MP4 est désormais diffusé directement
depuis l’URL privée signée en pièce jointe, sans dupliquer le fichier entier en
mémoire du navigateur.

## Recertification au SHA déployé du 26 septembre 2026

Le script permanent a été rejoué contre la production servant le SHA
`0a15d648fcb20061ccfa79059d0d68cdec6e7bfb`. La recette
`s6030-1790388062361-0180e911-c2ef-4d65-af11-d19b7f28ac12` obtient HTTP 200
et huit sources pour une recherche Serper réelle. Le solde Human Yo Impact
passe de 996,1763 à 996,0763 crédits, soit le débit unique attendu de 0,1
crédit. Le règlement rejoué retourne `applied=false`. L'usage reste
explicitement `pending_configuration` avec `SELL_PRICE_NOT_FOUND` : aucun prix
de vente n'est déduit silencieusement du coût.

La réservation d'échec séparée restitue les 100 000 microunités, restaure le
solde et refuse le second remboursement. Dans le navigateur de production,
l'administrateur Human Yo Impact et le super-administrateur voient le ledger du
tenant ; le membre temporaire obtient le périmètre `personal`, zéro écriture
étrangère et la section de crédits visible. Le compte et son adhésion sont
supprimés en fin de recette ; une lecture administrative filtrée confirme zéro
identité résiduelle.

Ce même SHA a passé Prettier, TypeScript, ESLint, 3 402 tests Vitest, le build
Next.js et 200 scénarios Playwright. Le déploiement Coolify
`knjgq73sc0fl6yrdarsfsbg3` est terminé ; le conteneur
`bcx5pxyuc9z3lt4jtyjipcqu-014702271694` est sain, sans redémarrage ni OOM, et
`/api/health` répond HTTP 200.
