# 07 — Legal & compliance · Chantier 2 — VIVRE

> **Fil conducteur** — Hérite du 0-SOCLE. Ce chantier porte les traitements les PLUS sensibles de la plateforme : enregistrement de sessions (voix de l'utilisateur incluse) + identifiant de traçage individuel. La DPIA est un GATE de build (S2-004), pas un document d'après-coup. Audit complet délégué à `rgpd-bounty-hunter` ; textes à re-vérifier en vigueur au moment de l'instruction.

## 1. Enregistrement des sessions live

- **Données traitées** : interventions texte ET VOIX de l'utilisateur (`session_events.payload`, `audio_path`). La voix est une donnée biométrique potentielle selon l'usage — ici usage de restitution (replay), pas d'identification biométrique : à qualifier précisément dans la DPIA.
- **Base légale** : consentement explicite par session (case `recorded`, action UI dédiée — jamais pré-cochée). Retrait : suppression du replay par l'utilisateur (S2-006) = suppression effective des événements ET pistes audio (pas un soft-delete d'affichage).
- **Information** : l'écran de consentement dit QUI enregistre, POUR QUOI (revoir sa session), COMBIEN DE TEMPS (politique de rétention à fixer avant prod), et le droit de suppression.
- **Maroc (loi 09-08 / CNDP)** : traitement de données vocales → vérifier le régime déclaratif/autorisation applicable au moment de la mise en prod (réforme en discussion — statut à re-vérifier live, jamais de citation de mémoire).

## 2. Identifiant indélébile (watermark par destinataire)

- **Finalité** : protection du contenu du créateur — traçage de la SOURCE d'un partage illicite. Finalité légitime mais traitement de traçage individuel → **DPIA quasi certaine** (croisement : données pseudonymisées + suivi systématique).
- **Pseudonymisation par construction** : le watermark encode `watermark_id` opaque, JAMAIS l'identité ; la correspondance vit uniquement dans `transmissions` (RLS stricte). Un tiers qui décode le watermark n'obtient rien sans accès à la table.
- **Information du destinataire** : la mention « Session remise à [prénom] » (06-brand) participe de l'obligation d'information — le destinataire SAIT que son exemplaire est individualisé. À formaliser dans les CGU.
- **Exploitation du traçage** : la v1 rend le traçage POSSIBLE ; toute exploitation (recherche active de fuites, action contre un utilisateur) est une décision d'Amine, hors périmètre ingénierie — mais la DPIA doit couvrir ce scénario d'usage dès maintenant.

## 3. Dettes assumées du chantier

| Dette | Pourquoi acceptable | Déclencheur |
|---|---|---|
| GO DPO de développement consigné ; formalité CNDP de production non encore datée | Le traitement reste désactivé pour les utilisateurs réels | GATE : avant activation production de S2-004 — confirmer la formalité applicable et consigner sa référence |
| Politique de rétention des replays non fixée | Préprod sans utilisateurs réels | Avant le flag `recording` en prod |
| CGU sans clauses enregistrement/watermark | idem | Avant ouverture publique du chantier |
| Qualification juridique voix (biométrie ou non) | Tranchée par la DPIA | Instruction DPIA |
