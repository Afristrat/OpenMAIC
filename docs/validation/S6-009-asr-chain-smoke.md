# S6-009 — Contrôle de chaîne ASR du 12 septembre 2026

## Résultat borné

Depuis le conteneur web Qalem en cours d’exécution, l’appel OpenAI-compatible
vers la configuration ASR administrée a reçu HTTP 200 pour un WAV de silence
PCM mono de une seconde. La mesure interne est de 678 ms. L’URL configurée est
HTTPS et son hôte n’appartient à aucune des plages privées contrôlées
(`localhost`, boucle locale, `10/8`, `172.16/12`, `192.168/16`).

La commande n’a affiché ni URL, ni modèle, ni clé, ni corps de réponse. Elle
prouve uniquement la connectivité runtime Qalem vers le relais ASR configuré,
avec un format WAV accepté. Elle ne prouve pas la qualité de transcription,
la chaîne microphone de navigateur, la réception par LiteLLM Hostinger ou
l’exécution finale sur DGX.

## Dette de validation conservée

S6-009 reste ouverte jusqu’à la recette authentifiée suivante :

1. extraits de parole humaine autorisée FR, arabe et EN, courts et longs,
   avec transcriptions de référence ;
2. mesure d’erreur et de latence par langue ;
3. microphone physique, refus de permission, fichier invalide et panne amont ;
4. preuve de bout en bout Qalem → LiteLLM Hostinger → tunnel Cloudflare → DGX,
   sans endpoint LAN ;
5. acceptation humaine explicite des résultats, sans confusion avec le TTS.

Les jeux de données Mozilla Common Voice publiés sous CC0 peuvent fournir des
échantillons autorisés, sous réserve de leur procédure d’accès et sans les
repartager dans le dépôt. Source : https://commonvoice.mozilla.org/en/datasets
