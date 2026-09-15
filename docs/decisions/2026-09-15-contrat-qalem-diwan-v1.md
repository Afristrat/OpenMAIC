# Contrat Qalem ↔ Diwan v1

## Décision

Qalem consomme Diwan exclusivement comme un service documentaire externe,
cloisonné par organisation. Les documents originaux, le découpage et les
embeddings restent chez Diwan. Qalem ne reçoit que des métadonnées de source,
des références versionnées et des extraits d’évidence strictement nécessaires
à la génération d’une formation.

Cette décision ne modifie pas Diwan. Elle formalise le contrat déjà appliqué
par l’adaptateur serveur Qalem `lib/diwan/client.ts`.

## Authentification et isolement

- Diwan émet un jeton de service distinct pour chaque UUID d’organisation
  Qalem, avec un périmètre limité à cette organisation.
- Qalem stocke le mapping JSON uniquement dans
  `QALEM_DIWAN_TENANT_TOKENS`, côté serveur et dans le coffre. Il est interdit
  dans le navigateur, dans une variable `NEXT_PUBLIC_*`, dans une URL ou dans
  une erreur renvoyée à l’utilisateur.
- L’absence, le doublon ou la réutilisation d’un jeton entre deux
  organisations déclenche `DIWAN_TENANT_NOT_CONFIGURED` : aucun fallback
  global ou inter-tenant n’est admis.
- Chaque requête est authentifiée avec `Authorization: Bearer <jeton tenant>`
  et limitée à 15 secondes. Les réponses non JSON, trop volumineuses ou non
  conformes au schéma sont rejetées.

## Surface v1 attendue de Diwan

Base : `https://diwan.ai-mpower.com/api/v1/consumers/qalem`.

| Opération | Méthode et chemin | Garantie attendue |
| --- | --- | --- |
| Lister | `GET /sources` | Sources du seul tenant, pagination bornée. |
| Importer | `POST /ingestions` | Jusqu’à 20 éléments non vides, 50 Mio au total, clé d’idempotence. |
| Suivre | `GET /ingestions/{jobId}` | Statut, progression et sources associées au tenant. |
| Figer | `POST /sources/manifest` | Chaque source demandée est renvoyée une seule fois avec version et checksum. |
| Interroger | `POST /retrieve` | Évidences bornées, toutes rattachées aux sources autorisées. |
| Aligner | `POST /alignment` | Couverture, lacunes et conflits cités ; résultat seulement consultatif. |
| Contradictions | `POST /conflicts` | Conflits multisources cités ; aucun « pas de conflit » ne vaut validation automatique. |
| Révoquer | `DELETE /corpora/{corpusId}` | Révocation explicite du corpus du tenant. |

Toutes les réponses portent `contractVersion: "1.0"` et `requestId`. Qalem
refuse une référence à une source, une version ou un chunk hors sélection.

## Mise en service restante

1. Diwan émet un jeton dédié à chaque organisation Qalem réellement activée.
2. Le mapping est ajouté au coffre via le canal contrôlé, puis injecté dans
   Qalem sans divulguer de valeur.
3. Une recette à deux organisations prouve : liste, import, attente de
   traitement, manifeste, interrogation, conflit, révocation et refus
   inter-tenant.
4. Qalem conserve les références versionnées dans son manifeste de formation ;
   il ne persiste ni le document original ni un jeton Diwan.

Sans l’étape 1, Qalem reste intentionnellement indisponible pour Diwan avec
une erreur contrôlée plutôt que de risquer une fuite entre organisations.
