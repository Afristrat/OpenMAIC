# ADR-001 — Watermark audio des transmissions privées : AudioSeal sous MIT

**Statut :** accepté pour une preuve de faisabilité mesurée, pas encore livré en production  
**Date :** 2026-07-23

## Contexte

Une transmission Qalem est remise à un destinataire déterminé et porte déjà un identifiant opaque de 128 bits (`watermark_id`). Le watermark audio doit permettre d'établir qu'un extrait provient de cette transmission sans modifier le chemin de lecture ni exposer la source non marquée.

La solution initialement prévue, `audiowmark`, est sous GPL-3.0. L'utilisateur a choisi une solution sous licence MIT.

La documentation officielle d'AudioSeal indique explicitement que le code **et les poids** sont distribués sous MIT, utilisables commercialement. Elle précise aussi que son message secret natif fait 16 bits : il ne peut donc pas, à lui seul, encoder l'identifiant Qalem de 128 bits.

Sources primaires :

- <https://github.com/facebookresearch/audioseal>
- <https://github.com/facebookresearch/audioseal/blob/main/LICENSE>

## Décision

Qalem retiendra **AudioSeal** pour la preuve de faisabilité, dans un sidecar Python dédié appelé uniquement par un job BullMQ de watermarking. Le navigateur ne charge ni modèle, ni poids, ni identifiant de watermark. Le fichier source reste immuable ; seul un dérivé privé est publié.

L'identifiant de 128 bits ne sera pas remplacé par un identifiant de 16 bits. Il sera réparti sur un cycle de onze segments audio de deux secondes :

| Champ AudioSeal | Contenu |
| --- | --- |
| 4 bits | index de segment, de `0` à `10` |
| 12 bits | tranche consécutive de l'identifiant opaque |

Les dix premiers segments portent 120 bits. Le onzième porte les 8 derniers bits et une somme de contrôle tronquée sur 4 bits ; la version du protocole est portée par cette ADR et son implémentation versionnée. Le cycle dure 22 secondes et se répète ; un extrait continu de 30 secondes doit donc contenir au moins un cycle complet, même s'il commence entre deux segments.

Le détecteur reconstitue l'identifiant uniquement s'il récupère les onze index, si la somme de contrôle est valide et si chaque segment franchit son seuil de confiance. Un résultat partiel est un échec, jamais une attribution approximative.

## Contraintes de livraison

1. Aucun artefact audio marqué n'est publié tant que le protocole P2-C n'est pas vert.
2. Le P2-C doit partir d'un MP4 de classroom réel et décoder exactement le même identifiant après MP3 128 kbit/s, OGG, normalisation et un extrait de 30 secondes non aligné.
3. Le sidecar est borné par cgroups et par une concurrence de `1`. Sa mémoire maximale est fixée seulement après mesure réelle sur ServeurAI.
4. Le sidecar et les poids ne sont ajoutés à aucune image distribuée avant validation du budget mémoire, de la licence et du P2-C.
5. La route de consultation ne sert que le dérivé audio/vidéo privé prêt ; aucun watermarking ne se produit sur une requête HTTP de lecture.

## Conséquences

- La contrainte produit de 128 bits est conservée sans prétendre qu'AudioSeal la fournit nativement.
- Le coût est un sidecar Python/PyTorch et un traitement différé ; il est acceptable seulement si la mesure reste dans le budget Qalem.
- Le watermark visuel existant demeure le mécanisme immédiatement vérifiable. Le watermark audio devient une couche supplémentaire de traçabilité, pas un substitut à l'autorisation, à la RLS ou au contrôle d'accès.

## Critères de sortie de la preuve de faisabilité

- mesure de mémoire à froid et au pic, durée par minute d'audio et taille des poids ;
- vecteurs P2-C reproductibles, dont un échec contrôlé sur un audio non marqué ;
- validation de la reconstruction 128 bits sans collision sur les vecteurs de test ;
- décision explicite de déploiement ou d'abandon documentée à partir de ces mesures.

## Mesure de faisabilité du 26 juillet 2026

Une sonde Docker éphémère, isolée de la stack Qalem, a été exécutée sur ServeurAI avec
`6 Gio` de mémoire maximale, `2 CPU`, `256 PID`, aucun redémarrage automatique et aucun port
exposé. Elle a été supprimée après la mesure. Le pic cgroup relevé est de `3 289 272 320` octets
(environ `3,06 Gio`) et le pic de processus est de `71` PID. Le budget de service retenable est
donc `4 Gio`, `2 CPU`, `128 PID` et une concurrence de `1` : il reste sous le plafond mesuré avec
une marge d'environ `0,94 Gio`, sans emprunter la mémoire du worker BullMQ Qalem.

Le modèle officiel AudioSeal `audioseal_wm_16bits` a reconstruit le message de contrôle `beef`
à l'identique, avec une probabilité comprise entre `0,999838` et `1,0`, après :

- une compression MP3 à `128 kbit/s` ;
- un encodage OGG/Opus ;
- un extrait non aligné de `30 secondes` ;
- une normalisation loudness.

Le vecteur était une voix Higgs générique, sans donnée personnelle. Un signal sinusoïdal non
vocal a échoué à la détection, ce qui est le comportement attendu d'un modèle entraîné pour la
parole et constitue un échec contrôlé utile.

Cette mesure ne clôt **pas** la P2-C : l'ADR exige un MP4 de classroom réel. Au moment de la
vérification, Qalem ne contenait aucun artefact source de transmission candidat (`0`). Aucun
sidecar durable, aucune image distribuée et aucun chemin de diffusion n'est donc ajouté avant
la création d'une transmission de validation et la répétition du protocole complet sur son MP4.
