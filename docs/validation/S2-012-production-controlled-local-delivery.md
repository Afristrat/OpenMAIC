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

Limites conservées explicitement : cette preuve ne prétend pas empêcher une copie après déchiffrement ni un enregistrement analogique.

## Validation par client contrôlé — 25 septembre 2026

Le SHA `7a2baf5498592f1ad11d51885dadcc9cd59cea74` ajoute
`qalem-local-controlled-proof`, un exécutable natif qui appelle exactement
`qalem-local-core`, le même noyau que le client Tauri. Il ne journalise ni clé,
ni identifiant, ni contenu.

La recette est rejouée contre le web production exact
`4a9dfb56652323d077c3477941e493f145449bb8`. Résultat :

```json
{
  "statuses": {
    "enrolled": 201,
    "issued": 201,
    "download": 200,
    "active": 200,
    "revoked": 204,
    "denied": 404,
    "browser": 401
  },
  "controlledClient": {
    "opened": true,
    "contentBytes": 338,
    "alteredManifestRefused": true,
    "expiredRefused": true,
    "wrongUserRefused": true,
    "wrongTenantRefused": true,
    "wrongDeviceRefused": true,
    "wrongDeviceKeyRefused": true,
    "staleStatusRefused": true,
    "revokedStatusRefused": true
  },
  "cleanupRows": [0, 0, 0, 0]
}
```

Le paquet autorisé est remis comme `application/octet-stream` avec une pièce
jointe `.qalempkg`, jamais comme contenu déchiffré. Une requête navigateur
anonyme reçoit 401. Le client natif contrôlé vérifie la signature, le statut
frais et toutes les liaisons avant ouverture ; après révocation, il refuse le
statut signé. Les binaires et scripts temporaires sont supprimés.

Le noyau passe 8/8 tests Rust et construit le binaire release avec le lockfile.
ESLint de la recette est vert. La gate complète du code web fonctionnel passe
3 373 tests Vitest et 196/196 Playwright au SHA déployé ; journal SHA-256
`8e8b70e1feeabd3770559bf9b5c34322f5339e9efdde4b172d52744a693e4bcb`.
Cette clôture utilise explicitement la branche « client contrôlé » du critère ;
elle ne revendique aucun essai physique ni impossibilité universelle de copie.
