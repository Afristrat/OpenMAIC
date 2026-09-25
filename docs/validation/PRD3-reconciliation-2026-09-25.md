# PRD 3 — Réconciliation actuelle

Date : 25 septembre 2026  
Branche : `refork-v030`  
Commit inspecté : `2ce57e1ce5e3701d0f72ff0d92666dd4169a4cd9`

## État réel

Le registre contient désormais **84 stories** :

- **67** sont `completed` avec `passes=true` ;
- **13** sont `to_validate` avec `passes=false` ;
- **4** sont `blocked` avec `passes=false` ;
- **0** reste `in_progress` ;
- **0** reste `to_implement`.

L’ancien état 83/49/34 du goal n’est donc plus représentatif du dépôt. S6-032 a ajouté une story au registre et a été clôturée ; les travaux autonomes S6-030, S6-031, Human Yo Impact, invitations, sécurité, exports LMS, import, données, Director et xAPI/LRS sont soldés par leurs preuves propres.

## Treize validations humaines ou physiques

| Story | Résidu exact |
|---|---|
| S6-021 | Réception physique d’une invitation nominative par son destinataire. Le parcours machine complet et la fermeture de l’inscription publique sont prouvés. |
| S6-009 | Microphone navigateur physique, refus de permission, panne visible et acceptation humaine des mesures ASR ; aucun verdict darija n’est inféré. |
| S6-012 | Écoute réelle depuis les deux sélecteurs vocaux de l’accueil authentifié. |
| S0-017 | Confirmation humaine de lisibilité des libellés de modèles image dans le sélecteur de production. |
| S6-010 | Installation et usage physiques PWA iOS/Android, regroupés avec S3-002. |
| U-020 | Vérification physique de la bannière d’installation PWA sur iOS et Android. |
| S3-002 | Réception application fermée et ouverture de la carte cible sur iOS et Android. |
| S3-012 | Reprise concurrente web/mobile réelle sur appareils. |
| S3-013 | Confidentialité observée sur écran verrouillé et acceptation humaine de la pression de relance. |
| S3-014 | Recette intégrée physique multisources → formation → notification → interaction → reprise, FR/AR/EN et RTL. |
| S0-012 | Verdict humain du parcours guidé arabe RTL. |
| S6-011 | Appairage QR du compte WhatsApp retenu, réception réelle, désinscription et absence de doublon. L’instance `qalem-reminders` est relue `close` le 25 septembre. |
| S3-008 | Produire vingt graines P3-B-v10 franchissant les nouveaux gardes de provenance, puis faire accepter humainement le ton et la fréquence. L’ancien échantillon P3-B-v6 est conservé comme historique, pas comme preuve courante. |

Douze de ces stories ne cachent aucune dette de code identifiée et restent ouvertes parce que leur critère final interdit de substituer une terminaison HTTP, un émulateur ou un test automatisé à l’observation demandée. S3-008 conserve un résidu autonome explicite : obtenir un échantillon courant propre avant de le soumettre au verdict humain. Les sorties fraîches contaminées ont été refusées, pas maquillées en preuve.

## Quatre dépendances Diwan

| Story | Résidu exact |
|---|---|
| S6-003 | Jeton interservice Qalem dédié, mapping tenant puis recette authentifiée du contrat documentaire Diwan. |
| S-019 | Connecteur NotebookLM et contrat fournisseur à implémenter dans Diwan. |
| S-020 | Connecteur Notion et contrat fournisseur à implémenter dans Diwan. |
| S-021 | Connecteur Google Drive et contrat fournisseur à implémenter dans Diwan. |

Qalem possède déjà le consommateur Diwan tenant-scopé. Aucun connecteur direct parallèle ne doit être ajouté dans Qalem et aucune story Diwan ne peut être déclarée livrée à partir d’un import manuel.

## Conséquence sur l’objectif

Le reliquat autonome Qalem est ramené à la production d’un échantillon S3-008 courant et propre. Les seize autres stories ouvertes sont douze checkpoints humains ou physiques et quatre dépendances Diwan. Le goal reste actif jusqu’à la réalisation ou à une décision explicite portant sur chacun de ces critères ; il ne doit pas être déclaré terminé à partir du seul état machine.
