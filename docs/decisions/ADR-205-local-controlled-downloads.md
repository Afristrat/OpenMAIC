# ADR-205 — Paquets téléchargés réservés au client local Qalem

Date : 14 septembre 2026  
État : acté, à implémenter par S2-012

## Décision

Un contenu Qalem explicitement téléchargé ne sera jamais remis sous une forme
déchiffrée à une page web. Il sera distribué dans un paquet chiffré et signé,
ouvert uniquement par **Qalem Local**, client natif séparé de la PWA.

Qalem Local sera fondé sur Tauri v2, avec des capacités minimales et séparées
par plateforme. Le client n’accordera aucune API locale à une origine distante :
seul son code embarqué pourra demander l’ouverture d’un paquet. Le serveur
émettra une licence bornée à un utilisateur, un tenant, un appareil enregistré,
une expiration et une révocation. Le client vérifiera la signature et ces
liaisons avant de déchiffrer le paquet dans son stockage local protégé.

## Portée et limites

- Les replays, transmissions et contenus suivis restent des flux authentifiés
  dans Qalem : ils ne deviennent pas des téléchargements.
- Les exports réglementaires de la personne et les rapports explicitement
  exportables ne sont pas renommés artificiellement en « paquets protégés » ;
  leur régime propre continue de s’appliquer.
- Aucun en-tête HTTP, user-agent ou PWA ne constitue ce contrôle. Les routes
  web doivent refuser le paquet protégé et ne jamais fournir sa version
  déchiffrée.
- Cette décision réduit l’usage légitime hors Qalem web ; elle ne promet pas
  l’impossibilité absolue de copie après déchiffrement, de capture analogique
  ou de compromission d’un appareil.
- AudioSeal et le filigrane restent des preuves de provenance. Ils ne sont pas
  assimilés à un DRM ni à une barrière d’exécution.

## Critères d’implémentation S2-012

1. Définir le format de paquet, le manifeste signé et la licence révocable.
2. Enregistrer la clé publique X25519 de chiffrement de l’appareil, sans
   secret embarqué côté web ; la clé Ed25519 distincte de Qalem signe les
   licences. Lier les autorisations au compte et au tenant contrôlés côté
   serveur.
3. Créer Qalem Local dans un runner de build isolé, jamais sur l’hôte de
   production ; limiter ses capacités aux fichiers de paquets et à l’ouverture
   contrôlée.
4. Prouver l’ouverture locale autorisée, et le refus navigateur, signature
   altérée, licence expirée/révoquée, autre tenant et autre utilisateur.
5. Afficher les conditions d’usage FR/AR/EN : usage local uniquement, jamais
   dans une interface web.

## Références

- Décision produit A6 : `docs/decisions/2026-09-12-prd-arbitrages.md#A6`.
- Capacités et frontières de Tauri v2 :
  <https://v2.tauri.app/security/capabilities/>.
- Mises à jour signées Tauri v2 :
  <https://v2.tauri.app/plugin/updater/>.
