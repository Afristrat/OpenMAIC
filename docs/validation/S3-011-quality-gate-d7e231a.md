# S3-011 — Gate complet du SHA `d7e231a`

Date : 12 septembre 2026  
Environnement : clone isolé ServeurIA `/tmp/qalem-s6-014-84b8856`, image
`qalem-validation:playwright-1.58.2-ffmpeg`, Chromium headless.

Commande exécutée :

```text
pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Résultat :

- Prettier, TypeScript et ESLint : succès ;
- Vitest : 524 fichiers, 3 270 tests réussis ;
- build Next.js : 123 routes, isolation standalone validée ;
- Playwright : 193 scénarios Chromium réussis en 7,5 minutes.

Le premier essai avec l’image Playwright générique a échoué car elle ne fournit
pas FFmpeg, requis par les tests audio/MP4. Le gate ci-dessus emploie l’image
Qalem avec FFmpeg : il ne masque donc aucun échec fonctionnel.

Cette preuve couvre la qualité machine du code, y compris l’export personnel
des réflexions d’ancrage. Elle ne remplace pas la recette S3-011 sur deux
apprenants, deux tenants, retrait de source et production.

## Schéma Qalem vérifié

Le 12 septembre, la lecture PostgreSQL de la base Qalem a confirmé la présence
des colonnes `source_event_id`, `source_kind` et `source_version` sur `seeds`,
du trigger `guard_anchor_seed_provenance`, de la table
`anchor_reflections` et de ses deux policies RLS. Aucun contenu apprenant n’a
été lu ni modifié. Le schéma n’est donc pas le prérequis manquant ; l’API
correspondante doit encore être déployée et recettée avec des acteurs réels.
