# S6-013 — Recette de formation complète, certification du 15 septembre 2026

## Objet

Cette preuve clôt la recette fraîche d'une formation complète avec ressource, agents, audio, approfondissement et exports réels. Elle remplace le blocage historique dû au fournisseur d'image.

## Recette de production

- Application fonctionnelle recettée : `04e9c203fbef086ac82f3daf6d4e147e73a945ce`.
- Marqueur de recette : `s6013-20260914T225116Z-certified`.
- Authentification temporaire, organisation temporaire et membership auteur créés.
- Une source autorisée et son manifeste ont été persistés.
- Le syllabus et un plan de cinq scènes ont été validés ; la génération a terminé avec succès.
- Les 32 segments TTS ont été générés. La formation rechargée conserve ses agents, audios et images.
- Le lien court, le QR, le classeur original puis complété/corrigé par Python, et le quiz réel à 100 % ont été vérifiés.
- L'approfondissement explicite et la reprise au curseur ont été vérifiés.
- L'export MP4 a été décodé et contrôlé scène par scène.
- Le nettoyage applicatif, suivi de son audit de secours, laisse zéro compte, organisation, stage, lien court ou fichier de recette.

## Qualité et déploiement final

La révision finale `488730e8dd93bd23ce1130c9a3d2fcabe0b7abd2` ne modifie pas le comportement recetté : elle normalise deux fichiers de formatage et aligne les tests de géométrie sur le fallback déterministe déjà déployé. Le gate complet sur cette révision est vert : formatage, TypeScript, ESLint, 3 307 tests unitaires, build et 193 tests Playwright.

Le conteneur de production sert cette révision, est `healthy`, n'a connu aucun redémarrage et n'a pas été tué par manque de mémoire. Au contrôle, son usage mémoire était de 101,3 Mio sur 1,5 Gio.

## Artefacts d'exécution

Les artefacts de recette sont disponibles pendant la rétention du serveur dans :

`/tmp/qalem-s6013-artifacts/s6013-20260914T225116Z-certified`

Ils comprennent notamment le MP4, les captures de rechargement et de reprise, les classeurs et le QR. Cette documentation versionnée est la preuve durable ; le répertoire temporaire n'est pas présenté comme un stockage pérenne.
