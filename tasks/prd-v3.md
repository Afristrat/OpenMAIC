[PRD]

# PRD v3 — Qalem : réconciliation et clôture prouvée

## Référence active

La source unique des US, critères, dépendances et statuts est [`.ralph/prd-v3.json`](../.ralph/prd-v3.json).
Cette vue est réconciliée le 12 septembre 2026 ; elle n’est pas un second backlog.
Le chantier ANCRER conserve sa spécification historique dans `tasks/prd-3-ancrer.md` ; les critères actifs et leurs compléments sont dans le PRD v3.

## Objectif et portée

Clôturer Qalem comme plateforme institutionnelle d’apprentissage adulte exploitable et commercialisable, web et mobile : invitations et tenants, formations multisources, andragogie FR/AR/EN, audio, progression et activités, ancrage personnalisé, données et optimiseur/Director, facturation, sécurité et exploitation.
GTM et présentation restent annexes. Aucun engagement conservé ne disparaît faute de preuve.

- Registre inspecté : 80 US ; 44 étiquetées `completed`, 26 `to_validate`, 4 `blocked`, 6 `to_implement`.
- 36 US portent `passes=false` ; ce ne sont pas 36 fonctionnalités à recoder. Le statut distingue travail restant et validation.
- Les dix US auparavant `passes=true/to_validate` sont désormais `passes=false`, avec toutes les preuves historiques conservées. Aucune normalisation automatique en livraison.
- Une étiquette `completed` ou un résultat historique ne certifie pas le déploiement actuel. La clôture finale exige les preuves au SHA livré.
- Une décision de retrait exige l’acceptation explicite d’Amine et n’est jamais une réussite d’implémentation.

## Compléments du 12 septembre 2026

La lecture de `lib/anchoring/seed-stock.ts`, de la route `app/api/live-sessions/[id]/seeds/route.ts`, de `lib/anchoring/schedule.ts` et de `app/api/notification-preferences/route.ts` montre un socle réutilisable, mais un contrat insuffisant pour l’ensemble des nouveaux engagements. Quatre US les rendent explicites :

| Engagement | Destination active | Frontière |
|---|---|---|
| Plusieurs sources, droits, versions, contradictions et références jusqu’aux scènes | S6-004, S6-006, S6-003 et S-019/020/021 | Pas de seconde bibliothèque ni de connecteurs directs parallèles à Diwan |
| Flashbacks, interventions ludiques, questions profondes et suivi issus du vécu individuel | S3-011 | Extension du stock S3-004 ; références d’événements vérifiables, aucune attribution inventée |
| Relances d’une formation inachevée et reprise contextualisée après connexion | S3-012 | Progression apprenant, distincte de la reprise du plan auteur et de l’ancrage après complétion |
| Horaires, fréquence, report, pause, arrêt, déduplication inter-formations et confidentialité | S3-013 | Réemploi des préférences, de BullMQ et des canaux existants ; plafond partagé |
| Formation complète sur mobile et chaîne push→interaction→reprise | S3-014 | Recette intégrée réelle ; U-020/S3-002 restent responsables de l’installation et du transport physique |

Les critères détaillés, cas négatifs et dépendances sont dans le JSON. Ces ajouts sont à implémenter, pas présentés comme déjà livrés.
La cible mobile reste la PWA existante, sans mandat implicite pour une application native publiée dans les stores.
Les vingt graines et leur fréquence nécessitent toujours le verdict humain S3-008.
La réception d’un push et son ouverture ne suffisent pas à démontrer sa pertinence ou un gain d’apprentissage.

## Priorités et autorisations

Sélectionner le plus petit `priorityRank` éligible selon ses dépendances ; une validation humaine ou un service externe ne doit pas empêcher les travaux autonomes.
Les quatre nouvelles US portent les rangs 24.1 à 24.4, après le transport push, sans déplacer les priorités de sécurité et d’infrastructure.

La [décision du 9 septembre](../docs/decisions/2026-09-09-unblock-prd.md) autorise les douze chantiers concernés, y compris la rotation des secrets Qalem.
Les anciens refus de rotation et demandes de décision ne sont plus les instructions actives.
Un statut `blocked` doit être relu avec `executionAllowed`, le motif technique et cette décision, et non interprété comme une nouvelle demande de permission.
L’autorisation ne vaut ni activation automatique, ni clôture des checkpoints humains, ni droit d’écrire dans Diwan ou un autre projet.

## Arbitrages réservés à Amine

Le [registre d’arbitrages du 12 septembre](../docs/decisions/2026-09-12-prd-arbitrages.md)
distingue les corrections factuelles des sept propositions de décision.
Aucun connecteur, canal, export ou filigrane n’a été retiré ni différé.
S3-005 est rouverte après lecture du chemin générateur→planificateur :
au-delà de douze graines, le calendrier fixe dépasse J+90. La reproduction
d’exécution reste à faire ; la preuve historique avec douze graines est conservée.

## Qualité et preuve de clôture

Exécution exclusivement sur ServeurIA, dans un clone isolé au SHA visé ; pas d’exécution applicative sur Windows :

```bash
pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Conteneurs bornés, sans builds concurrents. Pour chaque critère : date, SHA, environnement, commande ou parcours, résultat et artefact.
Les preuves incluent persistance, migrations, publication et parcours réel lorsque la capacité les nécessite.
Un HTTP 200/201, un fichier valide ou un navigateur simulant l’API n’est pas une preuve de livraison complète.
Les validations d’écoute, d’appareils physiques et les checkpoints humains ne sont pas remplaçables par un test machine.
Aucun gain d’apprentissage ou de marge n’est présumé ; la cible de marge moyenne de 95 % doit être définie et mesurée.

## Registre lisible

État documentaire du 12 septembre 2026, sans nouvelle certification. La colonne `passes` est volontairement distincte du statut.

| Rang | US | Priorité | Statut déclaré | passes | Engagement |
|---|---|---|---|---|---|
| 0 | S6-021 | P0 | `completed` | true | Fermer l’accès public et réserver l’inscription aux invitations nominatives |
| 0.1 | S6-022 | P0 | `completed` | true | Provisionner les tenants, leurs rôles et leurs plafonds de sièges |
| 0.2 | S6-023 | P0 | `completed` | true | Allouer les crédits et décompter chaque usage facturable |
| 0.3 | S6-024 | P0 | `completed` | true | Tarifer à la valeur et piloter une marge moyenne cible de 95 % |
| 0.4 | S6-025 | P0 | `completed` | true | Raccorder les usages fournisseurs réels au débit et à la valorisation |
| 1 | S6-001 | P0 | `completed` | true | Recertifier le SHA livré et solder le contrôle qualité global |
| 2 | S6-002 | P0 | `completed` | true | Terminer le diagnostic mémoire propre à Qalem |
| 3 | S0-015 | P0 | `completed` | true | Auth multi-tenant + persistance Storage sur le flux classroom (P0) |
| 4 | S6-017 | P0 | `completed` | true | Éliminer les vulnérabilités critiques et hautes des dépendances de production |
| 5 | S6-019 | P0 | `completed` | true | Éliminer les avis modérés et faibles des dépendances de production |
| 6 | S6-014 | P0 | `to_implement` | false | Traiter la dette de sécurité Qalem avec rotation autorisée |
| 7 | S6-018 | P1 | `completed` | true | Supprimer les erreurs serveur parasites des E2E à fallback IndexedDB |
| 8 | S6-005 | P1 | `completed` | true | Proposer une reformulation fondée sur les sources en cas de conflit |
| 9 | S6-006 | P1 | `completed` | true | Maintenir l’ancrage documentaire jusqu’aux scènes et à leur édition |
| 10 | S6-007 | P1 | `completed` | true | Créer les illustrations sans réutiliser les images du document source |
| 11 | S6-008 | P1 | `completed` | true | Afficher dirhams et prononcer le mot sans s final |
| 12 | S6-020 | P0 | `completed` | true | Rendre le gate silencieux sur toute erreur ou tout avertissement inattendu |
| 13 | S6-009 | P1 | `to_validate` | false | Recetter Whisper sur de la parole réelle et le parcours microphone |
| 14 | S6-003 | P1 | `blocked` | false | Consommer Diwan par un contrat documentaire autonome |
| 15 | S6-004 | P1 | `to_validate` | false | Bibliothèque et sélection de plusieurs sources par formation |
| 16 | S6-012 | P1 | `completed` | true | Qualifier le catalogue vocal français et anglais |
| 17 | S1-009 | P1 | `completed` | true | Gate audio : tachkil AR + plancher de bruit -50 dB sur toutes les sorties TTS |
| 18 | S4-010 | P1 | `completed` | true | Contexte territorial réutilisable et guidage laser lisible [UI] |
| 19 | S0-017 | P1 | `to_validate` | false | Modèles image LiteLLM administrés : libellés, sélection et preuve UI [UI] |
| 20 | S6-013 | P1 | `to_validate` | false | Recetter une formation complète avec ressources et exports réels |
| 21 | S-025 | P1 | `to_validate` | false | Extraire les items de révision depuis les quiz |
| 22 | S6-010 | P1 | `to_validate` | false | Déclencher les rappels de révision et vérifier le cache PWA |
| 23 | U-020 | P1 | `to_validate` | false | Bannière installer PWA |
| 24 | S3-002 | P1 | `to_validate` | false | Push PWA re-vérifié sur appareils réels iOS + Android |
| 24.1 | S3-011 | P1 | `to_validate` | false | Ancrer les flashbacks et questions dans le vécu de chaque apprenant |
| 24.2 | S3-012 | P1 | `to_implement` | false | Relancer les formations inachevées et reprendre au bon endroit |
| 24.3 | S3-013 | P1 | `to_implement` | false | Maîtriser la pression et la confidentialité des relances mobiles |
| 24.4 | S3-014 | P1 | `to_implement` | false | Prouver le parcours complet de formation et d’ancrage sur mobile |
| 25 | S0-012 | P1 | `to_validate` | false | [CHECKPOINT AMINE] Parcours guidé passe RTL ar-MA [UI] |
| 26 | S1-012 | P1 | `to_validate` | false | Capacité capture web réutilisable — service Playwright dédié + injection scène |
| 27 | S0-011 | P2 | `completed` | true | [CHECKPOINT AMINE] Checklist garder/abandonner des 72 stories |
| 28 | S1-007 | P2 | `to_validate` | false | Export SCORM couche 1 : package autonome importé dans Moodle |
| 29 | S1-008 | P2 | `to_validate` | false | Export couche 2 : adaptateurs scorm12/scorm2004/cmi5 interchangeables |
| 30 | S1-010 | P2 | `to_validate` | false | Export PPTX re-vérifié sur la nouvelle base |
| 31 | S1-004 | P2 | `to_validate` | false | Catalogue interne (porte 2) [UI] |
| 32 | S1-005 | P2 | `to_validate` | false | Import → outline éditable (porte 3) |
| 33 | S6-016 | P2 | `completed` | true | Clore le cadrage NP des widgets à partir du produit actuel |
| 34 | S6-026 | P2 | `completed` | true | Définir la grammaire bornée des compositions de widgets |
| 35 | S6-027 | P2 | `completed` | true | Persister et versionner les templates de widgets globaux |
| 36 | S6-028 | P2 | `completed` | true | Générer, prévisualiser et publier un widget depuis l'administration |
| 37 | S6-029 | P2 | `completed` | true | Consommer les widgets publiés et les exporter statiquement |
| 38 | S6-015 | P2 | `completed` | true | Composer et publier des widgets déterministes sans redéploiement |
| 39 | S6-011 | P2 | `to_validate` | false | Réconcilier puis livrer les canaux de rappel e-mail et WhatsApp retenus |
| 40 | S2-004 | P2 | `completed` | true | [GATE DPIA] Enregistrement du live : flux d'événements complet (agents + utilisateur) |
| 41 | S2-005 | P2 | `completed` | true | Replay fidèle « comme un vrai webinaire » (streaming, jamais de téléchargement) |
| 42 | S2-006 | P2 | `completed` | true | Bibliothèque de replays (reprise, suppression effective) [UI] |
| 43 | S2-008 | P2 | `to_validate` | false | Watermark sonore AudioSeal MIT en job BullMQ (protocole de robustesse) |
| 44 | S2-009 | P2 | `to_validate` | false | Watermark visuel indélébile |
| 45 | S2-011 | P2 | `completed` | true | [CHECKPOINT AMINE] Référentiels culture → prénoms validés |
| 46 | S3-001 | P2 | `completed` | true | Tables d'ancrage (seeds, anchor_plans, anchor_deliveries, evaluations, xapi_outbox) |
| 47 | S3-003 | P2 | `completed` | true | Évaluation à chaud en fin de session [UI] |
| 48 | S3-004 | P2 | `completed` | true | Générateur de graines : stock complet à la fin de session |
| 49 | S3-005 | P2 | `to_implement` | false | Plan d'ancrage opt-in + planification BullMQ ≤ J+90 |
| 50 | S3-006 | P2 | `completed` | true | Rappels quiz espacés via FSRS porté (cycle complet) |
| 51 | S3-007 | P2 | `completed` | true | Évaluations à froid J+30 / J+60 |
| 52 | S3-008 | P2 | `to_validate` | false | [CHECKPOINT AMINE] Ton des graines + fréquences validés sur échantillon |
| 53 | S3-009 | P2 | `completed` | true | Reporting ancrage : agrégats org uniquement [UI] |
| 54 | S3-010 | P2 | `completed` | true | Émission xAPI via outbox (retry, acteur pseudonymisé) |
| 55 | U-007 | P2 | `completed` | true | Bouton certificat dans classroom |
| 56 | U-008 | P2 | `completed` | true | Page Mes certificats |
| 57 | U-021 | P2 | `to_validate` | false | Bannière consentement télémétrie RGPD |
| 58 | S-018 | P3 | `completed` | true | Implémenter le MCP Client pour serveurs externes |
| 59 | S-019 | P3 | `blocked` | false | Connecter NotebookLM via Diwan |
| 60 | S-020 | P3 | `blocked` | false | Connecter Notion via Diwan |
| 61 | S-021 | P3 | `blocked` | false | Connecter Google Drive via Diwan |
| 62 | S-034 | P3 | `completed` | true | LTI Assignment and Grade Services (AGS) |
| 63 | S-035 | P3 | `to_validate` | false | Télémétrie xAPI |
| 64 | S-036 | P3 | `to_validate` | false | Collecter les données d’apprentissage et d’expérience utilisateur |
| 65 | S-037 | P3 | `to_validate` | false | Optimisation pipeline de génération par les données |
| 66 | S-047 | P3 | `to_validate` | false | Collecte des patterns de discussion multi-agent |
| 67 | S-048 | P3 | `to_validate` | false | Director data-driven |
| 68 | U-011 | P3 | `completed` | true | Publier un agent sur la marketplace |
| 69 | U-015 | P3 | `completed` | true | Configuration MCP dans admin |
| 70 | U-018 | P3 | `to_validate` | false | Widget xAPI status |
| 71 | S5-004 | P1 | `completed` | true | Plan auteur obligatoire et ingestion documentaire fiable [UI] |

## Limites et invariants

- `refork-v030` est la branche active ; `main` et les fichiers utilisateur non suivis restent intacts.
- Qalem web/runtime : ServeurIA/Coolify ; LiteLLM : Hostinger sans Coolify ; ASR distant via tunnel, aucun LAN supposé accessible.
- Consentements, refus, retrait, contrôle de rôle, isolation des tenants et RLS restent des frontières de confiance à prouver.
- Réutiliser les moteurs existants ; un statut obsolète ne justifie pas une réécriture.
- Recette finale multisources→formation→mobile→push→reprise→rapports, avec deux tenants et les trois langues.
- Ce travail réconcilie les engagements et les registres ; il n’applique aucune migration, rotation ou activation en production.

[/PRD]
