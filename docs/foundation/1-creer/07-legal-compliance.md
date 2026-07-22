# 07 — Legal & compliance · Chantier 1 — CRÉER

> **Fil conducteur** — Hérite du 0-SOCLE (licence AGPL, dettes socle, délégation `rgpd-bounty-hunter`). Couche propre : contenu utilisateur importé, contenu généré, exports vers LMS tiers. ⚠️ Tout texte cité se re-vérifie en vigueur avant publication d'un artefact conforme.

## 1. Contenu importé par l'utilisateur (porte 3)

- **Droits d'auteur** : l'utilisateur garantit détenir les droits du contenu déposé — clause à intégrer aux CGU au moment de l'ouverture de la porte 3 (déclencheur : S1-005 en préprod). La plateforme transforme (outline, scènes, voix) : le contrat doit couvrir cette transformation.
- **PII dans les documents déposés** : un document importé peut contenir des données personnelles de tiers (listes de stagiaires, exemples nominatifs). Dette assumée v1 : pas de détection automatique de PII ; mitigation : le canevas (S1-002) interdit explicitement les données nominatives de tiers ; déclencheur d'outillage : premier client organisation.
- **Rétention** : fichier source conservé dans Supabase Storage (`course_imports.storage_path`) — durée de rétention et suppression à la demande à définir dans la politique de confidentialité AVANT ouverture publique de la porte 3.

## 2. Contenu généré (portes 1 et 2)

- **Exactitude** : contenu pédagogique généré par LLM — mention d'usage claire (« contenu généré avec assistance IA, validé par le créateur ») ; la responsabilité éditoriale reste au créateur du course. À refléter dans les CGU.
- **Propriété du contenu généré** : le course appartient à son créateur (`owner_id`) — position à confirmer dans les CGU (décision Amine, hors périmètre ingénierie ; signalée ici car elle conditionne le catalogue et l'export).

## 3. Exports SCORM/cmi5 vers LMS tiers

- Le package exporté embarque le CONTENU mais **jamais de données personnelles d'apprenants Qalem** (le tracking se fait dans le LMS de destination — architecture deux couches favorable ici : le package est autonome).
- Runtime embarqué : aucun. Les adaptateurs utilisent exclusivement l’API fournie par le LMS ou le LRS de destination ; aucune dépendance tierce n’est distribuée dans le package (ADR-106).

## 4. Dettes assumées du chantier

| Dette | Pourquoi acceptable | Déclencheur |
|---|---|---|
| CGU non rédigées pour l'import | Porte 3 derrière flag, pas d'utilisateur externe | Ouverture du flag `import_pipeline` en prod |
| Pas de détection PII automatique dans les imports | Canevas l'interdit contractuellement | Premier client organisation OU premier incident |
| Politique de rétention des fichiers sources non écrite | Préprod uniquement | Bascule prod du chantier |
