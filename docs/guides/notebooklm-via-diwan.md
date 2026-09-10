# Sources NotebookLM — accès par Diwan

## État vérifié le 10 septembre 2026

**L’intégration NotebookLM n’est pas livrée.** Le choix d’architecture est déjà
consigné dans [la décision du 9 septembre](../decisions/2026-09-09-unblock-prd.md) :
Qalem utilise son adaptateur documentaire Diwan, sans second connecteur direct.
Le titre historique « via MCP » de S-019 ne prescrit donc plus l’installation
d’un serveur NotebookLM dans `mcp-servers.yml`.

Le code Qalem dispose d’un sélecteur Diwan et d’une résolution des références
dans le plan et la génération de formation. Ce code générique ne prouve pas
qu’un compte ou une source NotebookLM est connecté. Un fichier exporté puis
importé manuellement reste un import documentaire, pas cette intégration.

## Parcours prévu

L’auteur choisit son organisation, ouvre les sources de sa formation et
sélectionne une source disponible dans la bibliothèque Diwan. Qalem conserve
sa version et son empreinte, puis demande les passages pertinents au moment
de la génération. Une source inaccessible, modifiée ou sans passage probant
fait échouer la résolution : aucune substitution silencieuse par le Web.

Ce parcours n’est utilisable pour NotebookLM qu’après disponibilité réelle des
sources autorisées chez Diwan et configuration du jeton dédié à l’organisation.
Ne pas utiliser la session NotebookLM personnelle du poste comme credential
global de tous les tenants Qalem.

## Prérequis restant au service propriétaire

Le contrat documentaire Diwan v1 relu intégralement expose import, bibliothèque,
manifeste et recherche de passages. Il ne définit ni connexion NotebookLM,
ni authentification auprès de ce fournisseur, ni recherche de notebooks ou
résolution de leurs identifiants natifs. L’adaptateur Qalem n’invente pas ces
opérations.

Il reste à disposer d’un contrat fournisseur vérifiable couvrant :

- l’autorisation du compte et des sources pour l’organisation concernée ;
- la correspondance notebook/source → corpus/source/version Diwan ;
- la mise à jour, la perte de droits et la révocation de cet accès ;
- le jeton interservice dédié, distinct des clés de chiffrement et de LiteLLM.

Les modifications de Diwan appartiennent à sa session propriétaire. Aucun
endpoint, OAuth ou droit fournisseur supplémentaire n’est supposé disponible.

## Preuves et limite de certification

Contrat propriétaire consulté en lecture seule :
`C:/Users/amans/OneDrive/Projets/Diwan/open-notebook/docs/contracts/qalem-document-provider-v1.md`.
SHA-256 frais : `559952437d0802ae2150b3add557250c7aba5701aa245e05a525e0e1fdf952c2`.

Le GET anonyme de `/api/v1/consumers/qalem/sources`, exécuté depuis ServeurIA,
répond 401. Il prouve un refus anonyme, pas un accès autorisé.
L’index de noms du coffre Claude existe ; la recherche DIWAN/NOTEBOOK/LRS/XAPI
n’y trouve que `DIWAN_ENCRYPTION_KEY` et `DIWAN_LITELLM_KEY`, pas le mapping
`QALEM_DIWAN_TENANT_TOKENS`. Aucune valeur n’a été consultée ; ce constat sur
l’index ne certifie pas l’absence universelle d’un credential.

Avant clôture : accès réel autorisé, refus d’une source hors droits, recherche
de passages, formation citant cette source, vérification du retrait, puis gate
intégré et publication du SHA validé. S-019 reste ouverte.

Références de code : `lib/diwan/client.ts`, `lib/diwan/references.ts`,
`lib/server/formation-source-library.ts`, `lib/server/classroom-plan-generation.ts`
et `lib/server/classroom-generation.ts`.
