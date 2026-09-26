# PRD 3 — Réconciliation actuelle

Date de mise à jour : 26 septembre 2026
Branche : `refork-v030`
Commit fonctionnel déployé : `0a15d648fcb20061ccfa79059d0d68cdec6e7bfb`

## État réel

Le registre contient désormais **84 stories** :

- **69** sont `completed` avec `passes=true` ;
- **11** sont `to_validate` avec `passes=false` ;
- **4** sont `blocked` avec `passes=false` ;
- **0** reste `in_progress` ;
- **0** reste `to_implement`.

L’ancien état 83/49/34 du goal n’est donc plus représentatif du dépôt. S6-032 a ajouté une story au registre et a été clôturée ; les travaux autonomes S6-030, S6-031, Human Yo Impact, invitations, sécurité, exports LMS, import, données, Director et xAPI/LRS sont soldés par leurs preuves propres.

## Onze validations humaines ou physiques

| Story | Résidu exact |
|---|---|
| S6-021 | Réception physique d’une invitation nominative par son destinataire. Le parcours machine complet et la fermeture de l’inscription publique sont prouvés. |
| S6-009 | Microphone navigateur physique, refus de permission, panne visible et acceptation humaine des mesures ASR ; aucun verdict darija n’est inféré. |
| S6-010 | Installation et usage physiques PWA iOS/Android, regroupés avec S3-002. |
| U-020 | Vérification physique de la bannière d’installation PWA sur iOS et Android. |
| S3-002 | Réception application fermée et ouverture de la carte cible sur iOS et Android. |
| S3-012 | Reprise concurrente web/mobile réelle sur appareils. |
| S3-013 | Confidentialité observée sur écran verrouillé et acceptation humaine de la pression de relance. |
| S3-014 | Recette intégrée physique multisources → formation → notification → interaction → reprise, FR/AR/EN et RTL. |
| S0-012 | Verdict humain du parcours guidé arabe RTL. |
| S6-011 | Appairage QR du compte WhatsApp retenu, réception réelle, désinscription et absence de doublon. L’instance `qalem-reminders` est relue `close` le 25 septembre. |
| S3-008 | Acceptation humaine du ton et de la fréquence de l’échantillon P3-B-v11 : 20 graines, 4 289 jetons, distribution 6/6/4/4 et plan J+2 à J+90. L’ancien P3-B-v6 reste historique. |

Ces stories ne cachent aucune dette de code identifiée et restent ouvertes parce que leur critère final interdit de substituer une terminaison HTTP, un émulateur ou un test automatisé à l’observation demandée. Pour S3-008, les sorties contaminées ont été refusées et l’échantillon propre P3-B-v11 est versionné sans auto-acceptation. Le SHA exact `3c2dedf0be6fc5a4f53b80b6a5d99388c7f906fa` est déployé sainement par Coolify sous `2parydmimqxbn7tkf6wztl74` ; la dette machine est donc soldée.

Les onze gestes humains encore ouverts sont regroupés dans `docs/validation/PRD3-human-checkpoint-runbook-2026-09-25.md` : réception de bureau, invitation nominative, recette physique iOS/Android et WhatsApp. S6-012 et S0-017 y sont conservées comme verdicts acquis. Ce protocole ne transforme pas leur préparation en validation.

## Quatre dépendances Diwan

| Story | Résidu exact |
|---|---|
| S6-003 | Jeton interservice Qalem dédié, mapping tenant puis recette authentifiée du contrat documentaire Diwan. |
| S-019 | Connecteur NotebookLM et contrat fournisseur à implémenter dans Diwan. |
| S-020 | Connecteur Notion et contrat fournisseur à implémenter dans Diwan. |
| S-021 | Connecteur Google Drive et contrat fournisseur à implémenter dans Diwan. |

Qalem possède déjà le consommateur Diwan tenant-scopé. Aucun connecteur direct parallèle ne doit être ajouté dans Qalem et aucune story Diwan ne peut être déclarée livrée à partir d’un import manuel.

## Conséquence sur l’objectif

Le reliquat autonome Qalem est épuisé au sens du registre actuel. Les quinze stories ouvertes sont onze checkpoints humains ou physiques et quatre dépendances Diwan. S6-012 est clôturée après le verdict « Audible les deux » et S0-017 après confirmation de la lisibilité du modèle image. Le goal reste actif jusqu’à la réalisation ou à une décision explicite portant sur chacun des autres critères ; il ne doit pas être déclaré terminé à partir du seul état machine.
