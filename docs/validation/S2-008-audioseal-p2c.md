# S2-008 — Sidecar AudioSeal et protocole P2-C

**Date :** 10 septembre 2026  
**Code validé :** `5140085122cd87e7910a1fd7b3cbc8a6d6825726`

## Portée de la preuve

Un clone isolé de `refork-v030` a construit le service
`services/audioseal-sidecar` sur ServeurIA. Le modèle officiel
`audioseal_wm_16bits` s’est chargé avec succès. Le service est isolé du
réseau public, authentifié par un jeton entre worker et sidecar, séquentiel et
borné à 3 Gio, 1,5 CPU et 128 PID dans le compose.

Le premier démarrage a révélé que AudioSeal 0.2 déclenchait `torch.compile` et
réclamait un compilateur C++. Le sidecar fixe donc `NO_TORCH_COMPILE=1` : il
exécute le modèle officiel en inférence eager, sans compilation à chaud ni pool
de processus Inductor.

## P2-C mesuré

Le harnais `services/audioseal-sidecar/p2c.py` a reçu une fixture officielle
AudioSeal de 7,58 secondes répétée jusqu’à 50 secondes. Cette fixture est une
preuve de robustesse technique, pas une recette utilisateur ni une mesure de
qualité pédagogique.

Pour l’identifiant opaque `0123456789abcdef0123456789abcdef`, les onze
messages reconstituent exactement les 128 bits après chacun des traitements :

| Variante | Segments retenus | Identifiant reconstitué |
| --- | ---: | --- |
| MP3 produit | 11 | exact |
| MP3 128 kbit/s | 11 | exact |
| OGG | 11 | exact |
| Normalisation loudnorm | 11 | exact |
| Extrait de 30 s, décalé de 1 s | 11 | exact |

La sélection garde, pour chaque index embarqué, la fenêtre de deux secondes à
plus forte confiance. Une absence, une égalité contradictoire ou un segment
invalide échoue fermement avant toute reconstitution.

Le même harnais, rejoué sous les limites prévues, termine avec
`OOMKilled=false`, `RestartCount=0`, `Memory=3221225472`,
`NanoCpus=1500000000` et `PidsLimit=128`.

## Ce que cette preuve ne clôt pas

- Le sidecar n’est pas déployé dans la cible Qalem, et le flag `watermarking`
  reste désactivé.
- Le worker Qalem doit encore être raccordé à l’URL interne réellement servie,
  puis une transmission authentifiée doit être reçue en production.
- La recette de déploiement doit privilégier le DGX pour la latence : la preuve
  CPU bornée est stable, mais nettement plus lente que le parcours attendu.
- Aucun discours de résistance à des transformations hors P2-C ne doit être
  tenu.
