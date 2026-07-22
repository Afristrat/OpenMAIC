# S0-014 — Méthode clean-room des catalogues i18n

Ce document décrit une séparation technique de rôles. Il constitue une preuve de méthode et non un avis juridique.

## Périmètre

- Sources historiques isolées : `lib/i18n/chat.ts`, `common.ts`, `generation.ts`, `settings.ts`, `stage.ts` et `video-capsules.ts`.
- Contrats sans contenu : `refork/i18n-cleanroom-contract.json`, composé de 601 noms de clés nécessaires à Qalem, et `refork/i18n-dynamic-keys.json`, composé des 192 clés finies développées depuis les enums et constantes. Aucun ne contient d'ancienne valeur.
- Source sémantique autorisée : catalogue anglais du snapshot MIT v0.3 importé, composants consommateurs, types, énumérations et constantes du re-fork.
- Sorties : catalogues complets et plats `ui-en-US.json`, `ui-fr-FR.json` et `ui-ar-MA.json`.

## Séparation des rôles

1. L'auditeur de provenance, exposé aux fichiers historiques, ne transmet que les noms de clés, leurs consommateurs et leurs paramètres.
2. La rédaction anglaise est effectuée sans accès aux valeurs historiques. Les valeurs du socle MIT sont conservées ; les 601 valeurs Qalem sont rédigées à neuf depuis le contexte fonctionnel.
3. Les versions française et arabe sont traduites depuis ce nouveau catalogue anglais, jamais depuis les anciens catalogues.
4. Une revue distincte développe les 30 familles de clés dynamiques depuis leurs énumérations. Elle a détecté dix clés runtime absentes du premier catalogue anglais ; elles ont été rédigées puis ajoutées avant les traductions française et arabe.

## Contrôles exécutables

- parité exacte des clés entre les trois catalogues UI ;
- absence de chaîne vide ou de valeur égale à sa clé ;
- parité des paramètres i18next `{{paramètre}}` ;
- résolution des familles dynamiques ;
- absence des 35 chemins historiques et de leurs blobs v0.1 exacts ;
- manifeste `refork/audit-provenance.json` régénérable et vérifié par la CI.

Les contrôles automatisés prouvent les objets, chemins, empreintes et invariants déclarés. Ils ne peuvent pas conclure seuls à l'indépendance intellectuelle ou au régime juridique d'une distribution future.
