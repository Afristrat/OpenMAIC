# Ordre d’exécution autonome — clôture PRD3

## Règle de pilotage

Ce document rend le goal opérationnel : on traite d’abord les écarts qui sont
à la fois visibles par un utilisateur et vérifiables sans intervention
humaine, puis les recettes de serveur et enfin les validations physiques ou
les dépendances externes. Un statut `to_validate` ne signifie pas « code
manquant » ; il désigne un critère restant à prouver au SHA livré.

## Vague A — valeur visible, exécutable immédiatement par Qalem

1. **S6-012 — catalogue vocal** : instrumenter et recertifier le parcours
   d’écoute TTS de l’accueil, y compris erreur, annulation et sélection de
   voix. Le correctif déjà déployé reste à prouver par un scénario
   navigateur reproductible ; l’audition humaine est distincte.
2. **S6-010 — rappels et cache PWA** : rejouer les recettes serveur et
   navigateur disponibles, contrôler la déduplication et rendre les échecs
   visibles dans le produit.
3. **S1-004, S1-005, S1-007, S1-008, S1-010** : recertifier le catalogue,
   l’import éditable, SCORM et PPTX au SHA de clôture avec artefacts générés
   et inspections automatiques.
4. **S-037, S-047, S-048** : compléter les recettes intégrées désormais
   déverrouillées par S-036 : zéro/une/plusieurs observations, consentement,
   retrait/réaccord, isolation tenant, repli et résultats Director visibles.
5. **U-018** : raccorder le widget xAPI au véritable état sûr du système :
   LRS intentionnellement arrêté = configuration requise, jamais « sain ».

## Vague B — infrastructure et exploitation, exécutable sans utilisateur

1. **S-035** : le LRS souverain est actif, protégé par ses secrets Qalem
   dédiés et accessible par le tunnel Cloudflare dédié `lrs.qalem.ma` ;
   l’authentification HTTPS est prouvée. Il reste la recette intégrée
   outbox/consentement et la décision explicite d’activer un tenant. Aucun
   secret partagé n’est réutilisé.
2. **S6-014** : achever uniquement les rotations dont la clé est dédiée à
   Qalem, prouver les consommateurs puis la révocation. Les clés Resend
   partagées ai-mpower restent exclues : leur rotation est une opération
   multi-projets, non une autonomie Qalem.
3. **S6-021** : contrôler sans réémettre de courrier la frontière
   invitation/inscription et les URLs ; seule la réception par un destinataire
   est une validation humaine.
4. **S3-005** : recertifier le plan d’ancrage, les stocks 12/13/20 graines,
   la planification et la déduplication au SHA de clôture.
5. **S2-012** : recertifier diffusion locale, chiffrement, révocation et
   absence de lecture web des contenus téléchargés.

## Vague C — impossibles à clôturer seul, donc préparés mais jamais simulés

- **S6-009** : écoute microphone, refus de permission, fichier invalide et
  panne amont dans un navigateur réel. La topologie Hostinger → LiteLLM →
  DGX/Tailscale est déjà prouvée ; Cloudflare n’est pas ce maillon.
- **S0-017, S0-012** : lisibilité et parcours humain de production.
- **S3-002, S3-012, S3-013, S3-014, U-020** : installation, push et reprise
  sur iOS et Android réels.
- **S3-008** : validation éditoriale explicite du ton des graines.
- **U-021** : décision humaine sur la finalité de collecte avant activation.
- **S1-012** : capacité de capture qui dépend d’un service externe réel.
- **S6-003, S-019, S-020, S-021** : contrat et exécution Diwan/NotebookLM/
  Notion/Google Drive hors du dépôt Qalem.

## Inventaire exhaustif des stories ouvertes

| État | Stories | Traitement suivant |
| --- | --- | --- |
| À implémenter | S6-014 | Vague B : rotations Qalem dédiées et contrôles de révocation. |
| À valider, autonomie serveur ou recette reproductible | S6-012, S6-010, S1-004, S1-005, S1-007, S1-008, S1-010, S6-011, S2-012, S3-005, S-035, S-036, S-037, S-047, S-048, U-018 | Vagues A puis B. |
| À valider, critère physique/humain restant | S6-021, S6-009, S0-017, S0-012, S3-002, S3-012, S3-013, S3-014, U-020, S3-008, U-021, S1-012 | Préparer les preuves ; ne pas marquer livré sans ce critère. |
| Bloquée hors Qalem | S6-003, S-019, S-020, S-021 | Contrat Qalem prêt, intégration Diwan à traiter dans son dépôt. |

La priorité n’autorise ni l’activation d’une collecte, ni l’envoi de
notifications, ni la rotation d’une clé partagée sans preuve de périmètre.
