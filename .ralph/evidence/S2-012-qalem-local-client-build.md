# S2-012 — Compilation du client Qalem Local

Date : 14 septembre 2026
SHA : `9c1e73ec7215692c311dfc3d148f9b2519320315`

## Portée vérifiée

Le client natif Tauri Qalem Local conserve la clé X25519 de l’appareil dans le trousseau du système. Il n’accepte qu’un fichier `.qalempkg` borné, lit l’utilisateur, le tenant et l’appareil depuis le manifeste signé, puis vérifie la clé de signature Qalem, l’échéance et le manifeste avant de déchiffrer le contenu. Il ne demande donc pas ces trois identifiants à recopier. Son interface est une WebView locale à CSP sans connexion réseau ; aucun plugin d’accès générique au système de fichiers ou au réseau n’est déclaré.

La dépendance Tauri est verrouillée à `2.11.5`, son outil de construction à `2.6.3`, et `Cargo.lock` est versionné. Le répertoire Tauri généré est ignoré par Git.

## Exécution ServeurIA

Clone isolé du SHA exact dans `/tmp/qalem-s2-012-client-check-job/workspace`, image Linux dédiée `qalem-tauri-validation:rust-1.89` avec les prérequis WebKitGTK et DBus :

```bash
rustup component add rustfmt >/dev/null && cargo fmt --check && CARGO_TARGET_DIR=/target cargo check --locked
```

Résultat : succès, profil `dev`, sans résolution de dépendance additionnelle. L’empreinte SHA-256 du verrou produit puis versionné est `0b7e7b9c938371ea0a9bd3f4672c858473151548d6e7990acf292ab186ef1c18`.

## Limites explicites

Cette preuve ne valide pas encore l’enrôlement authentifié, l’émission d’un paquet réel, la révocation en production, la lecture par un appareil final ni la recette des refus depuis un navigateur. Elle ne constitue pas une promesse de DRM ou d’impossibilité de copie après une ouverture légitime.
