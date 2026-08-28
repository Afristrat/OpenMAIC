# S2-009 — Filigrane visuel sur une transmission réelle

Date : 28 août 2026  
Environnement : worker Qalem de production sur `serveuria-MS-7D98`  
Image : `a14gf0n3u719hnnd2yujrtmr_qalem-workers:f37767998c418ec4b5e3ad9cb385d946c2f47288`

## Résultat

Une recette éphémère a créé deux comptes techniques distincts, une organisation comptant exactement ces deux membres, une scène et une transmission privée. Le destinataire appartenait donc réellement à l’organisation de la scène ; aucune identité existante n’a été réutilisée.

La transmission munie d’une source MP4 a été envoyée dans la file BullMQ `transmission-visual-watermark`. Le worker actif a publié la dérivée privée puis placé la transmission à l’état `done`. L’identifiant opaque généré par la base était :

`a5a4b355 ec9d274b 53756b17 aae64dea`

La capture extraite à une seconde du MP4 marqué restitue les 128 bits complets, dans le même ordre. Elle est conservée dans [`artifacts/S2-009-capture.png`](artifacts/S2-009-capture.png), SHA-256 `c03ec0c6b4a28d6dda9af4ffe504fe973dce94a7965cdf553957bde569d61ed5`.

## Contrôles techniques

- destinataire présent parmi les deux membres de l’organisation : oui ;
- identifiant affiché identique à celui de la ligne `transmissions` : oui ;
- source relue après traitement, identique bit à bit : SHA-256 `95678f029b8ae8f30d35383dfee2f04a07cbff4b0eec110fecc22bad05aeab52` ;
- dérivée MP4 : 31 668 octets, SHA-256 `6bbb07dae32bc9c95c801d20e5282e1ba4de3d006fff094006935bbb9ec51b42` ;
- `ffprobe` : une piste vidéo 1 280 × 720 et une piste audio ;
- capture PNG : 51 412 octets, identifiant complet lisible visuellement.

Le diff entre le SHA déployé et le SHA de recette ne contient aucune modification de `visual-watermark.ts`, des workers, des files, des migrations de transmission ni du test d’intégration. La recette exerce donc exactement le code inspecté et versionné.

## Nettoyage

Après extraction des artefacts de preuve, la source et la dérivée ont été supprimées du bucket privé. La transmission, la scène, l’organisation, ses membres, le job BullMQ et les deux comptes techniques ont été supprimés. Les recomptages finaux donnent zéro transmission, zéro scène, zéro organisation et zéro membre pour les identifiants temporaires ; les deux comptes ont été supprimés.

L’artefact local complet reste sous `C:\projets\Qalem\proofs\S2-009-20260828\` ; ses fichiers possèdent les mêmes empreintes que les sorties extraites du conteneur.

## Portée de l’expression « indélébile »

Conformément à l’ADR-206, le filigrane est brûlé dans toutes les images de la dérivée MP4 servie. Il ne constitue ni un DRM ni une résistance garantie à un recadrage malveillant ; aucune promesse cryptographique supplémentaire n’est formulée.
