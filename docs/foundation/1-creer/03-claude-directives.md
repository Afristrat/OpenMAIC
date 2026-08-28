# 03 — Directives Claude · Chantier 1 — CRÉER

> **Fil conducteur** — Hérite intégralement du `0-socle/03-claude-directives.md` (branche unique, copier-adapter, commits `[S1-XXX]`, quality gate, ADR, i18n/RTL, Ponytail). N'ajoute que le spécifique CRÉER.

## Spécifique au chantier

1. **Feature flags obligatoires** : chaque porte d'entrée en construction s'abrite derrière son flag (`import_pipeline`, `course_catalog`, `scorm_export`) — la base reste déployable à tout moment (ADR-006 du socle).
2. **Canevas d'import = co-validation AVANT code** : aucune ligne du pipeline d'import (S1-003+) tant que le canevas (S1-002) n'est pas validé par Amine ET Claude. Proposer, consigner la tranche, puis coder.
3. **Édition de documents** : MAIC Editor / Edit with AI sont NATIFS v0.3.0 — les consommer, ne jamais les réimplémenter ; toute adaptation = copie-adaptation depuis l'upstream, pas du neuf.
4. **Moteur andragogique** : le chantier CÂBLE (`getPromptOverride()`, agents, templates du manifest) — le CONTENU des overrides appartient au chantier 4-MOTEUR. Ne pas écrire de contenu andragogique ici : consommer l'interface.
5. **Hyperframes** : session Mishkāt = lecture seule (règle n°6 globale). L'intégration vit côté Qalem (appel de pipeline, interface de fichiers) — jamais de modification du repo mishkat depuis cette session.
6. **Exports** : architecture deux couches non négociable — un SEUL générateur de package, des adaptateurs de tracking interchangeables (scorm12/scorm2004/cmi5/xAPI). Un export qui fusionne package et tracking sera refusé en review.
7. **Audio** : tout pipeline TTS ajouté passe le garde-fou noise-floor (seuil -50 dB, concept validé sur Dīwān) — une piste sous le seuil ne sort pas.
8. **Nouveau provider TTS** = `generateXxxTTS()` dans `lib/audio/tts-providers.ts` + entrée `constants.ts` (convention repo).

## Pointeurs

`02-data-dictionary.md` (courses/course_imports/export_jobs) · `04-feature-backlog.md` (v1 gelée) · `05-integrations.md` (Hyperframes, adaptateurs SCORM natifs, MinerU) · ADR transverses : `0-socle/08-decisions-log.md`.
