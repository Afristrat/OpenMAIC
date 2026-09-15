# S6-009 — Première mesure de parole humaine en production

Date : 2026-09-15

La recette authentifiée `scripts/proofs/s6-009-asr-production.js` a été exécutée dans le conteneur web public Qalem. Elle crée un compte et une organisation de recette, appelle la route Qalem `/api/transcription` avec le fournisseur administré `openai-whisper`, puis les supprime. Aucun fichier audio n’est conservé.

Le corpus est [FLEURS](https://huggingface.co/datasets/google/fleurs), split validation : des enregistrements de parole humaine accompagnés de leur transcription de référence. Les erreurs sont des taux de mots calculés par distance d’édition après normalisation Unicode et ponctuation ; aucun seuil d’acceptation n’est inventé.

| Langue | Durée | Statut | Latence | Mots de référence | Mots transcrits | Erreur de mots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Français, court | 6,00 s | 200 | 1 756 ms | 24 | 24 | 0 % |
| Français, long | 14,46 s | 200 | 1 611 ms | 40 | 40 | 0 % |
| Arabe standard, court | 10,92 s | 200 | 1 797 ms | 16 | 16 | 6,25 % |
| Arabe standard, long | 12,66 s | 200 | 1 676 ms | 14 | 14 | 14,29 % |
| Anglais, court | 6,54 s | 200 | 1 570 ms | 15 | 15 | 0 % |
| Anglais, long | 16,38 s | 200 | 1 748 ms | 33 | 33 | 15,15 % |

Cette preuve établit une transcription Qalem fonctionnelle sur trois langues et des voix humaines autorisées, sur des extraits courts et longs. Elle ne clôt pas S6-009 : le microphone réel et ses refus de permission, la panne amont et l’attestation de la portion LiteLLM Hostinger → Cloudflare → DGX restent à effectuer. L’arabe mesuré est de l’arabe standard ; aucune conclusion n’est tirée sur le darija marocain ni sur la qualité TTS.
