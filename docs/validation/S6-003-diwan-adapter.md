# S6-003 — Adaptateur documentaire Diwan

## État au 9 septembre 2026

Code candidat, pas une clôture. Le mandat « Go alors pour les 21US » permet
l’implémentation côté Qalem. Il n’autorise ni la modification du projet Diwan,
ni une rotation, ni la certification des checkpoints humains.

## Contrat vérifié

Contrat propriétaire lu intégralement avec son OpenAPI :
`C:\Users\amans\OneDrive\Projets\Diwan\open-notebook\docs\contracts\qalem-document-provider-v1.md`.
Dernier commit touchant ce document : `d3d9103800d6a49c4f577701b6fd2bf917f4f8f9`.
SHA-256 du fichier lu : `559952437d0802ae2150b3add557250c7aba5701aa245e05a525e0e1fdf952c2`.

Origine fixe : `https://diwan.ai-mpower.com/api/v1/consumers/qalem`.
Un GET anonyme réel de `/sources`, depuis ServeurIA, répond **401**.
Ce contrôle ne prouve pas l’accès authentifié ni les garanties internes de Diwan.
La lecture complémentaire du routeur propriétaire confirme qu’un rejeu d’import
renvoie l’état courant du job, qui peut être `ready`, et pas seulement `queued`.
Aucun fichier Diwan modifié ou importé dans Qalem.

## Code candidat

- `lib/diwan/client.ts` : ingestion multipart, statut durable, bibliothèque,
  manifeste, recherche avec liste blanche et révocation du corpus.
- `/api/documents/diwan/[organizationId]` : GET bibliothèque ; POST commande JSON
  `status`, `manifest`, `retrieve`, `revoke`, ou import multipart.
- L’organisation sélectionnée dans le chemin est vérifiée par la session serveur :
  appartenance active et rôle auteur/manager/admin obligatoires, sans exemption
  super-administrateur. Elle sélectionne ensuite un jeton dédié côté serveur.
- `QALEM_DIWAN_TENANT_TOKENS` : mapping JSON UUID Qalem → jeton dédié.
  Aucun défaut global ; jeton partagé entre deux organisations refusé.
  Organisation et jeton fournis dans le corps sont refusés, jamais relayés.
- HTTPS fixe, redirections interdites, aucune relance automatique ambiguë,
  délai de 15 secondes et réponse plafonnée à 2 Mio réellement lus.
- Import : 20 sources maximum, 50 Mio au total, un import multipart simultané
  par processus web. Ce plafond borne le tampon ; ce n’est pas une garantie
  d’absence d’OOM ni un verrou distribué.
- Réponses validées et champs non déclarés supprimés. Sources étrangères à la
  liste blanche, manifeste incomplet et version incompatible refusés.
- La révocation n’est pas un effacement physique : conformément au contrat,
  les sources partagées avec d’autres corpus sont préservées.

## Vérifications exécutées

ServeurIA, conteneur `qalem-refork-exec`, copie de travail isolée sur la base
`8b995bda7b732be8af95fba8953461e449301d5a` avec les quatre nouveaux fichiers :

```sh
pnpm exec prettier lib/diwan tests/diwan app/api/documents/diwan --write
pnpm exec vitest run tests/diwan
pnpm typecheck
pnpm lint --max-warnings=0
```

Session 61337 terminée avec code 0 : **24/24 tests**, TypeScript et lint global
verts. Tests réseau/auth simulés, sauf le refus anonyme réel décrit plus haut.
Les contrôles couvrent refus inter-organisations, absence de credential,
provenance, timeout, flux surdimensionné ou interrompu, JSON invalide, erreur
fournisseur, rejet des mutations inter-origines et fichier multipart natif.

## Conditions de clôture encore ouvertes

1. Fournir un jeton de service Qalem dédié et son organisation Diwan associée.
   L’index `C:\Users\amans\.claude\secrets.index` consulté ne contient pas
   cette entrée ; ni la clé LiteLLM Diwan ni sa clé de chiffrement ne la remplacent.
2. Configurer le mapping persistant côté Qalem après confirmation de cette liaison.
   Aucun credential créé, remplacé ou injecté par ce lot.
3. Recette authentifiée réelle, incluant import, suivi, provenance, refus croisé,
   indisponibilité et révocation d’un corpus de recette autorisé.
4. Gate complet du lot, build et navigateur ; publication vérifiée ensuite.
   Aucun déploiement ni nouveau gate global annoncé pour ce candidat.
5. Le raccordement à une interface de sélection de sources et aux étapes de
   génération n’est pas livré par cet adaptateur d’API. Les endpoints d’analyse
   `/alignment` et `/conflicts` ne sont pas encore exposés côté Qalem.

`passes=false` est conservé. Aucun autre gate du PRD n’est levé automatiquement.
