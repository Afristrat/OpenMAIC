# S2-009 — Recertification production du filigrane visuel

Date : 15 septembre 2026

Environnement : worker Qalem de production sur `serveuria-MS-7D98`
Image : `a14gf0n3u719hnnd2yujrtmr_qalem-workers:cf82466b08e07f61cdcf133f4c5d08715ceb1559`

## Recette réelle et isolée

Deux utilisateurs techniques temporaires, une organisation active de deux membres, une scène et une transmission privée ont été créés avec le rôle service. Le destinataire était membre de l’organisation de la scène. Aucun compte, tenant ou contenu métier existant n’a été réemployé.

Le flag `watermarking` était absent et donc fermé par défaut : le chemin AudioSeal n’a pas été invoqué. La source MP4 temporaire a été déposée dans le bucket privé, puis la transmission a été placée dans la file BullMQ `transmission-visual-watermark`. Le worker actif a produit la dérivée et publié l’état `done`.

| Contrôle | Résultat |
| --- | --- |
| Identifiant de transmission rendu | `474b7507 6bea8802 f5dcbd0e 749e0ca1` |
| Source inchangée | oui, SHA-256 `62f3bea5e282660b6ad13ced4e019d1b3396074972fa3e754f404841144bc191` avant et après |
| Dérivée MP4 | 614 874 octets, SHA-256 `59662e02796ef5163e8c84f4ce66c8f6b6793eab67797609e40625244846e269` |
| Flux de la dérivée | vidéo 1 280 × 720 et piste audio présentes |
| Capture extraite | 192 589 octets, SHA-256 `6897cd7758cf044d9c62a1803f2d22c159b6ed4554f9c60b7505ef26e8602325` |

La capture est versionnée sous [S2-009-capture-2026-09-15.png](artifacts/S2-009-capture-2026-09-15.png). Elle affiche le libellé « Qalem · transmission individuelle » et l’intégralité des 128 bits, lisibles à l’écran dans le même ordre que la ligne de transmission.

## Nettoyage et état du runtime

Après la recette, les recomptages donnent zéro organisation, scène, transmission, objet du bucket `transmissions`, job BullMQ et compte technique portant le préfixe de recette. Les fichiers éphémères du worker et du serveur ont été supprimés.

Le worker et le capture-worker issus du runtime unique sont `healthy`, avec `RestartCount=0` et `OOMKilled=false`. Le SHA applicatif déployé ne diffère du SHA `488730e8dd93bd23ce1130c9a3d2fcabe0b7abd2`, passé en gate complet, que par des fichiers de PRD, journal et preuve ; il n’y a donc aucune modification fonctionnelle de S2-009 entre le gate et cette recette.

## Limite explicite

Le filigrane est incrusté dans chaque image de la dérivée servie. Il fournit une traçabilité dissuasive, mais ne constitue ni un DRM ni une garantie contre le recadrage, la copie ou l’enregistrement analogique.
