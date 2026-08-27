[PRD]

# PRD v3 — Qalem : réconciliation et clôture prouvée

## Référence active

La source unique des US, critères, dépendances et statuts est [`.ralph/prd-v3.json`](../.ralph/prd-v3.json).
Ce document est une vue de lecture du registre mise à jour le 27 août 2026, pas un second backlog.
Le chantier 3 ANCRER conserve sa spécification dans `tasks/prd-3-ancrer.md` ; « v3 » désigne ici la version consolidée du PRD.

## Objectif et portée

Réconcilier les demandes explicites avec les registres et le code inspecté au commit `332941dc7f0727dc673c4364f78e122b879f2f96`, puis fermer chaque reste sur preuve.
Aucune fonctionnalité n’est implémentée par cette opération documentaire.

- 65 stories v2 inventoriées : 26 ouvertes reprises, 3 rouvertes, 36 acceptations historiques conservées sans recertification.
- 72 stories v1/UI rattachées à une décision de conservation et à leurs US de suivi ; 18 capacités héritées sont explicitement remises en suivi.
- 17 demandes/ensembles d’engagements rattachés à des US.
- 63 US actives : 15 à implémenter, 22 à valider, 21 avec décision préalable, 5 bloquées.
- Huit US sont soldées sur preuves actuelles. Une décision de retrait n’est jamais une réussite d’implémentation.
- S0-015 est entièrement certifiée côté machine sur le SHA déployé `6ea54d9` ; seule l’écoute humaine SOP-011 maintient son état « À valider ».

## Limites de preuve

L’audit initial du 26 août ne disposait pas de SSH ni de Mnemo. L’accès SSH canonique a été rétabli le 27 août ; le clone historique ServeurIA s’est révélé divergent et sale, donc impropre à la certification.
Le code et les documents locaux sont inspectables ; les services déployés et les résultats de tests actuels doivent être recertifiés dans un clone isolé neuf.
La réconciliation documentaire des registres identifiés ne signifie donc pas « produit totalement recertifié ».
Le PRD v3 et ses pointeurs sont suivis sur `refork-v030` ; leur publication distante et les trois SHA de production ont été recertifiés dans S6-001.

## Priorités

1. **P0 — certification et protection** : état réel du SHA, qualité globale, isolation/persistance et mémoire propre à Qalem. La dette de secrets demeure bloquée par le refus de rotation.
2. **P1 — promesses produit immédiates** : reformulation intelligente, fidélité documentaire jusqu’aux scènes, illustrations originales, dirhams, syllabus, Whisper réel, catalogue vocal, PWA et recettes utilisateur.
3. **P2 — achèvement du produit** : catalogue/import, exports, capture, replay, ancrage et cadrage des widgets.
4. **P3 — héritage à arbitrer** : MCP directs, LTI, collecte et optimisation par les données, marketplace ; aucune réactivation implicite.

Le rang donne une préférence, pas une permission. Les dépendances et les gates restent prioritaires.
Les corrections autonomes S6-005/006/007/008 peuvent avancer sans attendre l’adaptateur Diwan S6-003.

## Quality Gates

Exclusivement dans un clone isolé sur ServeurIA, au SHA de la story :

- `pnpm check` : formatage global.
- `npx tsc --noEmit` : zéro erreur.
- `pnpm lint` : zéro erreur et zéro avertissement.
- `pnpm test` : suite complète.
- `pnpm build` : build de production.
- `pnpm test:e2e` : suite complète, navigateur headless distant.

Exécuter les phases dans des conteneurs bornés, sans concurrence de builds qui fausserait la mesure mémoire.
Pour chaque critère : date, SHA, environnement, résultat et artefact dans `closureEvidence`.
Les contrôles d’interface et d’audio explicitement humains restent des validations humaines.
Un HTTP 200, un JSON non vide ou un fichier OOXML valide ne prouvent pas à eux seuls une expérience correcte.

## Exigences transversales

- FR-1 : chaque ancienne US possède une disposition et une destination ; aucune case historique ne constitue une preuve actuelle.
- FR-2 : chaque US active conserve ses critères, son motif d’ouverture et ses prérequis.
- FR-3 : réutiliser le code déjà présent ; un statut obsolète ne justifie pas une réécriture.
- FR-4 : le code ISO MAD reste interne ; sa restitution pédagogique et vocale est traitée séparément.
- FR-5 : les images PDF ne peuvent pas servir de repli silencieux à une génération d’illustration échouée.
- FR-6 : les callbacks, contrôles de droits, données persistées et effets utilisateur doivent être testés, pas seulement l’existence d’un composant.
- FR-7 : Qalem seul est modifiable ; LiteLLM est sur Hostinger, sans Coolify ; Diwan reste un service indépendant.
- FR-8 : aucun consentement, choix de canal, retrait de fonctionnalité ou feu vert de sécurité ne se déduit d’un « go » documentaire.

## User Stories

Les descriptions et critères exécutables complets sont dans le JSON canonique.

| Rang | US     | Priorité | État             | Livrable                                                                              |
| ---- | ------ | -------- | ---------------- | ------------------------------------------------------------------------------------- |
| 1    | S6-001 | P0       | Soldée           | Recertifier le SHA livré et solder le contrôle qualité global                         |
| 2    | S6-002 | P0       | Bloquée          | Terminer le diagnostic mémoire propre à Qalem                                         |
| 3    | S0-015 | P0       | À valider        | Auth multi-tenant + persistance Storage sur le flux classroom (P0)                    |
| 4    | S6-014 | P0       | Bloquée          | Conserver la dette de sécurité Qalem sous autorisation explicite                      |
| 5    | S6-005 | P1       | Soldée           | Proposer une reformulation fondée sur les sources en cas de conflit                   |
| 6    | S6-006 | P1       | Soldée           | Maintenir l’ancrage documentaire jusqu’aux scènes et à leur édition                   |
| 7    | S6-007 | P1       | Soldée           | Créer les illustrations sans réutiliser les images du document source                 |
| 8    | S6-008 | P1       | Soldée           | Afficher dirhams et prononcer le mot sans s final                                     |
| 9    | S5-004 | P1       | Soldée           | Plan auteur obligatoire et ingestion documentaire fiable [UI]                         |
| 10   | S6-009 | P1       | À valider        | Recetter Whisper sur de la parole réelle et le parcours microphone                    |
| 11   | S6-003 | P1       | Bloquée          | Consommer Diwan par un contrat documentaire autonome                                  |
| 12   | S6-004 | P1       | Soldée           | Bibliothèque et sélection de plusieurs sources par formation                          |
| 13   | S6-012 | P1       | À valider        | Qualifier le catalogue vocal français et anglais                                      |
| 14   | S1-009 | P1       | Soldée           | Gate audio : tachkil AR + plancher de bruit -50 dB sur toutes les sorties TTS         |
| 15   | S4-010 | P1       | Soldée           | Contexte territorial réutilisable et guidage laser lisible [UI]                       |
| 16   | S0-017 | P1       | À valider        | Modèles image LiteLLM administrés : libellés, sélection et preuve UI [UI]             |
| 17   | S6-013 | P1       | À valider        | Recetter une formation complète avec ressources et exports réels                      |
| 18   | S-025  | P1       | Soldée           | Extraire les items de révision depuis les quiz                                        |
| 19   | S6-010 | P1       | À implémenter    | Déclencher les rappels de révision et vérifier le cache PWA                           |
| 20   | U-020  | P1       | À implémenter    | Bannière installer PWA                                                                |
| 21   | S3-002 | P1       | À valider        | Push PWA re-vérifié sur appareils réels iOS + Android                                 |
| 22   | S0-012 | P1       | À valider        | [CHECKPOINT AMINE] Parcours guidé passe RTL ar-MA [UI]                                |
| 23   | S1-012 | P1       | À valider        | Capacité capture web réutilisable — service Playwright dédié + injection scène        |
| 24   | S0-011 | P2       | Décision requise | [CHECKPOINT AMINE] Checklist garder/abandonner des 72 stories                         |
| 25   | S1-007 | P2       | À valider        | Export SCORM couche 1 : package autonome importé dans Moodle                          |
| 26   | S1-008 | P2       | À valider        | Export couche 2 : adaptateurs scorm12/scorm2004/cmi5 interchangeables                 |
| 27   | S1-010 | P2       | À valider        | Export PPTX re-vérifié sur la nouvelle base                                           |
| 28   | S1-004 | P2       | À valider        | Catalogue interne (porte 2) [UI]                                                      |
| 29   | S1-005 | P2       | À implémenter    | Import → outline éditable (porte 3)                                                   |
| 30   | S6-016 | P2       | Décision requise | Clore le cadrage NP des widgets à partir du produit actuel                            |
| 31   | S6-015 | P2       | Décision requise | Composer et publier des widgets déterministes sans redéploiement                      |
| 32   | S6-011 | P2       | Décision requise | Réconcilier puis livrer les canaux de rappel e-mail et WhatsApp retenus               |
| 33   | S2-004 | P2       | Bloquée          | [GATE DPIA] Enregistrement du live : flux d'événements complet (agents + utilisateur) |
| 34   | S2-005 | P2       | À implémenter    | Replay fidèle « comme un vrai webinaire » (streaming, jamais de téléchargement)       |
| 35   | S2-006 | P2       | À implémenter    | Bibliothèque de replays (reprise, suppression effective) [UI]                         |
| 36   | S2-008 | P2       | Bloquée          | Watermark sonore AudioSeal MIT en job BullMQ (protocole de robustesse)                |
| 37   | S2-009 | P2       | À valider        | Watermark visuel indélébile                                                           |
| 38   | S2-011 | P2       | Décision requise | [CHECKPOINT AMINE] Référentiels culture → prénoms validés                             |
| 39   | S3-001 | P2       | À implémenter    | Tables d'ancrage (seeds, anchor_plans, anchor_deliveries, evaluations, xapi_outbox)   |
| 40   | S3-003 | P2       | À implémenter    | Évaluation à chaud en fin de session [UI]                                             |
| 41   | S3-004 | P2       | À implémenter    | Générateur de graines : stock complet à la fin de session                             |
| 42   | S3-005 | P2       | À implémenter    | Plan d'ancrage opt-in + planification BullMQ ≤ J+90                                   |
| 43   | S3-006 | P2       | À implémenter    | Rappels quiz espacés via FSRS porté (cycle complet)                                   |
| 44   | S3-007 | P2       | À implémenter    | Évaluations à froid J+30 / J+60                                                       |
| 45   | S3-008 | P2       | Décision requise | [CHECKPOINT AMINE] Ton des graines + fréquences validés sur échantillon               |
| 46   | S3-009 | P2       | À implémenter    | Reporting ancrage : agrégats org uniquement [UI]                                      |
| 47   | S3-010 | P2       | À implémenter    | Émission xAPI via outbox (retry, acteur pseudonymisé)                                 |
| 48   | U-007  | P2       | Décision requise | Bouton certificat dans classroom                                                      |
| 49   | U-008  | P2       | À valider        | Page Mes certificats                                                                  |
| 50   | U-021  | P2       | Décision requise | Bannière consentement télémétrie RGPD                                                 |
| 51   | S-018  | P3       | Décision requise | Implémenter le MCP Client pour serveurs externes                                      |
| 52   | S-019  | P3       | Décision requise | Connecter NotebookLM via MCP                                                          |
| 53   | S-020  | P3       | Décision requise | Connecter Notion via MCP                                                              |
| 54   | S-021  | P3       | Décision requise | Connecter Google Drive via MCP                                                        |
| 55   | S-034  | P3       | Décision requise | LTI Assignment and Grade Services (AGS)                                               |
| 56   | S-035  | P3       | Décision requise | Télémétrie xAPI                                                                       |
| 57   | S-036  | P3       | Décision requise | Pipeline de collecte de données pédagogiques                                          |
| 58   | S-037  | P3       | Décision requise | Optimisation pipeline de génération par les données                                   |
| 59   | S-047  | P3       | Décision requise | Collecte des patterns de discussion multi-agent                                       |
| 60   | S-048  | P3       | Décision requise | Director data-driven                                                                  |
| 61   | U-011  | P3       | Décision requise | Publier un agent sur la marketplace                                                   |
| 62   | U-015  | P3       | Décision requise | Configuration MCP dans admin                                                          |
| 63   | U-018  | P3       | Décision requise | Widget xAPI status                                                                    |

## Décisions encore ouvertes

- Conservation des capacités historiques : S0-011.
- Portée e-mail/WhatsApp : S6-011.
- Contrat documentaire Diwan : S6-003, à obtenir sans modifier le projet propriétaire.
- Capture web explicitement demandée versus visuels originaux : S1-012/S6-007.
- Choix SCORM statique et runtime réellement utilisé : S1-007/008.
- Cadrage et publication de widgets par le super-admin : S6-015/016.
- DPIA, budget/conformité watermark, référentiels culturels et validations humaines : gates conservés dans les US.
- Rotations : refus maintenu, S6-014 non exécutable.

## Hors périmètre

Aucune modification de `main`, d’un autre projet, de credentials ou de production.
Aucun lancement du mode Ralph ni création d’automatisation.
Aucune prétention à une validation métier/production complète avec les accès actuels.

## Mesures de réussite

Couverture intégrale des identifiants sources, zéro doublon actif, zéro dépendance inconnue ou cyclique,
zéro clôture sans preuve, et réduction des US actives seulement par livraison vérifiée ou retrait explicitement décidé.
[/PRD]
