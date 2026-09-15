# S2-012 — Diffusion locale contrôlée : recette de production

Date : 2026-09-15

SHA de l’application publique : `4f22afacbcb3cf48fb42ad6e8cf9db36c940c455`
Conteneur web : healthy, sans redémarrage en cours ni OOM (`Restarting=false`, `OOMKilled=false`).

La recette authentifiée `scripts/proofs/s2-012-production.js` s’exécute dans le conteneur web public. Elle crée un compte et une organisation de recette, puis les supprime systématiquement. Elle ne journalise ni secret, ni identifiant métier, ni contenu du paquet.

Résultat observé :

```json
{
  "statuses": {
    "enrolled": 201,
    "issued": 201,
    "download": 200,
    "active": 200,
    "revoked": 204,
    "denied": 404
  },
  "cleanupRows": [0, 0, 0, 0]
}
```

Le parcours couvre l’enrôlement authentifié d’une clé X25519, l’émission d’un paquet chiffré lié au tenant, l’obtention par une route authentifiée, la vérification de la signature Ed25519 Qalem et le déchiffrement AES-GCM avec la clé privée de l’appareil. La recette vérifie également un statut de licence signé actif, révoque l’appareil, vérifie un statut signé révoqué et constate le refus de tout nouveau téléchargement.

Les quatre zéros confirment, après suppression, l’absence de lignes de recette dans `organization_sources`, `local_client_devices`, `local_content_packages` et `local_content_licenses` pour l’organisation temporaire.

Limites conservées explicitement : cette preuve ne prétend pas empêcher une copie après déchiffrement ni un enregistrement analogique. La validation physique du client final sur appareils contrôlés et le gate complet de la révision de livraison restent requis avant `passes=true`.
