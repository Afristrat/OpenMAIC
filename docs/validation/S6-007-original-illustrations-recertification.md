# S6-007 — Illustrations originales

## Recertification du 3 septembre 2026

Le SHA fonctionnel déployé `9935016ced2aedbc4a633eeec4179c449952a002`
applique la politique d’illustration au parent commun du pipeline. Les
`suggestedImageIds` issus d’un document sont supprimés ; si un visuel est utile,
la demande devient une génération originale avec interdiction explicite de
reproduire, tracer, imiter ou réutiliser l’image source. Une génération absente
ou une URL de provenance source échoue au lieu de produire un repli silencieux.

Sur ServeurIA, 68/68 tests ciblés couvrent la politique, les échecs et reprises,
la provenance persistée, la géométrie, les QR codes et le chemin distinct des
captures web. Le journal Vitest a pour SHA-256
`a36d31b011f4e482abf4a37e6565c5384c190091304ae2a3ac4a6ec4e422fec3`.

Le parcours Chromium `slide-content-surface-647` passe 1/1. La capture
`docs/validation/artifacts/S6-007-original-photosynthesis-illustration.png`,
SHA-256 `2b72a88b5442e5f596096e0cd7ce18fe81119f28ef6c10d4d206b69b7d25136e`,
a été inspectée à sa résolution originale : soleil, feuille, oxygène et glucose
sont lisibles et pertinents ; le visuel reste entièrement dans la diapositive,
sans coupe ni chevauchement avec le titre. Le journal Playwright a pour SHA-256
`a749f788fcf682b0f071c5b7940cd8f9fafbfbce4e51a778976063d4e95c2c3d`.

Le gate complet du même graphe passe Prettier, TypeScript, ESLint, 420 fichiers
et 2 640 tests Vitest, le build Next.js de 107 routes et 105 tests Playwright
sur 105.
