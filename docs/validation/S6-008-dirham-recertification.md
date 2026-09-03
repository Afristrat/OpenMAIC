# S6-008 — Affichage et prononciation de dirham

## Recertification du 3 septembre 2026

Le SHA fonctionnel déployé `9935016ced2aedbc4a633eeec4179c449952a002`
conserve `MAD` comme code ISO 4217 interne. Les directives pédagogiques
françaises exigent `dirham` pour 1 et `dirhams` au pluriel dans le texte visible.
Le point commun TTS prépare une copie vocale distincte où seul le mot entier
français `dirhams`, quelle que soit sa casse, devient `dirham`. Le texte affiché,
les nombres, les sigles voisins, les autres devises, l’anglais et l’arabe ne sont
pas modifiés.

Sur ServeurIA, 35/35 tests ciblés couvrent la représentation pédagogique, la
préparation vocale, le corps fournisseur, l’API, la génération persistée et la
propagation de langue. Le journal a pour SHA-256
`2d2e92cf431965ce07ded65ed87252bc00b626efa3d3a5d1e260272b9cca4fc4`.

La preuve humaine demeure rattachée au même algorithme :
`lib/audio/tts-utils.ts` est inchangé depuis le commit S6-008 écouté. Le WAV
accepté par Amine existe encore, mesure 250 604 octets et a pour SHA-256
`7e012f539668ae50477dfbbd068d1140c232ba705c665cffb916284a8749a932`.
Verdict consigné : conforme pour une locutrice française prononçant le mot arabe
marocain `dirham`.

Le gate complet du même graphe passe Prettier, TypeScript, ESLint, 420 fichiers
et 2 640 tests Vitest, le build Next.js de 107 routes et 105 tests Playwright
sur 105.
