# S6-009 — Première mesure de parole humaine en production

Date : 2026-09-15

La recette authentifiée `scripts/proofs/s6-009-asr-production.js` a été exécutée dans le conteneur web public Qalem. Elle crée un compte et une organisation de recette, appelle la route Qalem `/api/transcription` avec le fournisseur administré `openai-whisper`, puis les supprime. Aucun fichier audio n’est conservé.

Le corpus est [FLEURS](https://huggingface.co/datasets/google/fleurs), split validation : des enregistrements de parole humaine accompagnés de leur transcription de référence. Les erreurs sont des taux de mots calculés par distance d’édition après normalisation Unicode et ponctuation ; aucun seuil d’acceptation n’est inventé.

| Langue | Statut | Latence | Mots de référence | Mots transcrits | Erreur de mots |
| --- | ---: | ---: | ---: | ---: | ---: |
| Français | 200 | 2 153 ms | 40 | 40 | 0 % |
| Arabe standard | 200 | 1 969 ms | 14 | 14 | 14,29 % |
| Anglais | 200 | 1 755 ms | 15 | 15 | 0 % |

Cette preuve établit une transcription Qalem fonctionnelle sur trois langues et des voix humaines autorisées. Elle ne clôt pas S6-009 : les extraits longs, le microphone réel et ses refus de permission, la panne amont et l’attestation de la portion LiteLLM Hostinger → Cloudflare → DGX restent à effectuer. L’arabe mesuré est de l’arabe standard ; aucune conclusion n’est tirée sur le darija marocain ni sur la qualité TTS.
