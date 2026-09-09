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
  manifeste, recherche avec liste blanche, révocation du corpus, alignement
  de la demande et analyse des contradictions.
- `/api/documents/diwan/[organizationId]` : GET bibliothèque ; POST commande JSON
  `status`, `manifest`, `retrieve`, `revoke`, `alignment`, `conflicts`, ou import multipart.
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
5. L’interface de sélection Diwan reste à raccorder. Le raccordement serveur aux
   manifestes et à la génération est codé dans le complément ci-dessous, mais
   sa migration n’est pas encore appliquée durablement.

## Complément — Alignement et contradictions

Session ServeurIA 72557 terminée avec code 0 : **37/37 tests ciblés**, TypeScript
et lint global sans avertissement. Les deux opérations d’analyse utilisent
le même transport, les mêmes permissions de route et la même liste blanche.
Les conflits doivent citer au moins deux sources autorisées et deux blocs
distincts. Une réponse contradictoire sans arbitrage auteur est refusée.
Une réponse déclarée alignée sans exigence étayée est également refusée.

Limite constatée par lecture du code propriétaire
`open_notebook/consumers/analysis.py`, fonction `detect_conflicts` : une erreur
de parsing/analyse peut être transformée en `no_material_conflict` avec une liste
vide. De plus, les réponses v1 ne joignent pas les extraits aux identifiants de
blocs cités ; leur authenticité reste une garantie du fournisseur, pas une
preuve reconstituable par ce client seul. Qalem ajoute donc `advisoryOnly=true`
aux analyses : aucune autorisation automatique de génération ne doit être
déduite d’un résultat négatif. Ce défaut de contrat a été signalé à Amine ;
aucune correction transfrontalière n’a été effectuée.

Point d’intégration identifié : le popover existant utilise
`formation_source_manifests` et `resolveFormationSources`. Il faudra y conserver
les références/version/empreinte Diwan, pas recopier des documents complets
dans Qalem ou remplacer le parcours local déjà opérationnel.

## Complément — Manifestes et génération

Migration candidate `20260909121728_diwan_source_references.sql`, créée par
Supabase CLI 2.117.0 sur ServeurIA après lecture de son aide. Elle ajoute au
manifeste existant des références corpus/source/version/empreinte/titre, limitées
avec les sources locales à vingt éléments. Le RPC reste SECURITY INVOKER avec
search_path vide et EXECUTE réservé à service_role. La RLS existante reste active.
Les versions deviennent immuables au niveau SQL ; le lien historique peut toujours
être mis à NULL par la suppression de la version précédente.

Le PUT de sélection accepte seulement corpusId/sourceId ; le serveur obtient
version et empreinte par le manifeste Diwan autorisé. Un ancien appel sans
sélection Diwan conserve les références précédentes ; une liste vide les retire.
Le contrôle optimiste de version évite d’écraser une sélection concurrente.

`resolveFormationSources`, utilisé par le plan et la génération de classroom,
recherche maintenant les extraits pour la demande courante et les sources choisies.
Une version ou empreinte changée, une source non étayée ou une erreur du fournisseur
interrompt la résolution, sans substitution Web. Les vrais chunkId et métadonnées
de page traversent le moteur de citations sans redécoupage en faux identifiants.
Seuls les extraits sont transmis au contexte de génération, pas les fichiers
originaux ou les vecteurs Diwan.

Vérifications du 9 septembre :

- 52/52 tests ciblés (Diwan + bibliothèque + API des manifestes) et TypeScript
  verts, commande terminée exit 0. Lint global vert, session 62020 exit 0.
- Premier échec du test d’indisponibilité corrigé dans son hook : le hook
  retournait le mock, interprété comme fonction de nettoyage ; aucun résultat
  de production n’était concerné. La propagation de l’erreur reste testée.
- PostgreSQL Qalem réel, transaction avec délais de verrouillage et d’exécution
  bornés : migration, `scripts/proofs/s6003-manifest.sql`,
  `S6003_MANIFEST_PROOF_OK`, puis **ROLLBACK**, exit 0. Références, conservation,
  retrait, conflit de version, immutabilité, doublons, empreinte invalide,
  privilèges RPC et refus RLS hors tenant vérifiés avec le tenant synthétique
  S-034. Aucun changement durable de schéma ou de données.
- Advisors complets et gate global du lot restent à exécuter avant publication.
  La preuve SQL ciblée ne les remplace pas.

La skill Supabase a conduit à conserver les permissions explicites et à vérifier
SQL et RLS réellement. Documentation consultée :
[fonctions](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[changelog](https://supabase.com/changelog). Aucun changement de version de la
stack ou de passerelle n’est effectué.

`passes=false` est conservé. Aucun autre gate du PRD n’est levé automatiquement.
