# S1-009 — Recertification de la gate audio et du tachkil

Date : 2026-09-03

Branche : `refork-v030`

SHA certifié : `df6023a879d76eb6468ff317b1cff26027702b93`

## Contrat recertifié

Le point commun `generateTTS()` refuse avant tout appel réseau un texte arabe non vocalisé destiné à un fournisseur qui ne garantit pas le tachkil. Les fournisseurs Higgs et VoxCPM peuvent recevoir le texte arabe brut parce que leur backend applique le tachkil ; le service Higgs actif confirme `tachkil=true` et `tachkil_engine=jais2`.

Toute piste retournée par le point commun est ensuite mesurée. Le WAV PCM16 est décodé nativement, le MP3 par le FFmpeg déjà requis par l’export vidéo, et tout format non contrôlable est refusé. Le live et la narration persistée convergent vers ce point commun. Une capsule Mishkāt n’est publiée que si chacune de ses variantes porte `gatePassed=true`. L’export MP4 retélécharge enfin les pistes persistées et rejoue la gate avant assemblage.

## Preuves ciblées sur ServeurIA

Huit fichiers et 57/57 tests réussis couvrent :

- tachkil présent, absent et pris en charge nativement ;
- refus pré-réseau de l’arabe non vocalisé sur un fournisseur non compatible ;
- WAV PCM16 et MP3 au-dessus et sous −50 dBFS, silence et format inconnu ;
- route TTS, narration persistée et choix de voix ;
- contrat `gatePassed` des capsules ;
- recontrôle des pistes persistées par l’export MP4.

Le conteneur ciblé est sorti avec le code 0, `OOMKilled=false`. Journal SHA-256 : `9ee59450d264007445bac603df017d30fe2588146492e54b3ffeac280a7acf2b`.

## Preuve de production

Le parcours authentifié sur `https://qalem.ma` a utilisé le seul fournisseur TTS administré actif, Higgs Audio v3 :

- français, voix `hanae` : WAV de 178 604 octets, durée 3,72 s, crête −12,2 dBFS, SHA-256 `191ec86654617fdc469a73585d8d74e8f98a6a3c41ff48489def3e3580572448` ;
- arabe non vocalisé, voix `tariq` : WAV de 236 204 octets, durée 4,92 s, crête −8,4 dBFS, SHA-256 `49d12cf0bed8d1f582f7549274fd60ea19e234899230e6164cea2305be30395f` ;
- fournisseur non compatible : refus `Tachkil requis` avant synthèse.

FFmpeg décode les deux pistes réelles et leurs crêtes dépassent largement le seuil de −50 dBFS. L’artefact structuré a le SHA-256 `d69d975c475a663b66ba5440a9d2b3f141dfe788cfbd3eb2c436941f7493eac7`. Après le parcours, le nettoyage est confirmé deux fois : réponses de suppression réussies, puis inventaire indépendant à zéro utilisateur et zéro organisation préfixés S1-009.

Artefacts permanents : `C:/Users/amans/.codex/visualizations/2026/08/15/01a005ad-360e-7710-aeb5-bf5fc84c67b6/s1-009/`.

## Incident CUDA observé et résolu

Le premier appel arabe a exposé un défaut d’exploitation réel : `torch.AcceleratorError: CUDA error: unknown error` dans Jais2. Le conteneur Higgs était encore `running`, sans redémarrage ni OOM, mais `torch.cuda.is_available()` retournait `false` et aucun GPU n’était visible. Le redémarrage du seul conteneur `higgs-tts` a restauré le GPU NVIDIA GB10 et un calcul tensoriel CUDA, puis `/health` et les synthèses française et arabe ont réussi. Qalem, Whisper, le tunnel et le DGX n’ont pas été redémarrés.

Un timeout Playwright intermédiaire a affiché le cookie du compte de preuve dans le transcript. Il ne contenait aucun secret permanent Qalem, Supabase ou Dīwān. Le compte et son tenant ont été supprimés, et les deux journaux temporaires qui contenaient cette session ont été détruits avant la preuve finale.

## Gate complet

Au SHA exact `df6023a879d76eb6468ff317b1cff26027702b93`, dans un worktree isolé sur ServeurIA :

- audit de production : aucune vulnérabilité connue ;
- Prettier, TypeScript et ESLint : verts ;
- Vitest : 420/420 fichiers et 2 641/2 641 tests ;
- build Next.js : 151 routes ;
- Playwright Chromium : 105/105.

Le conteneur est sorti avec le code 0 et `OOMKilled=false`. Journal SHA-256 : `201093cb6c5389a1cd02072d0fe3224804590cd02ea1330deaff037b043b7509`.
