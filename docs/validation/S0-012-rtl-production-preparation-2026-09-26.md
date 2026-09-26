# S0-012 — Préparation du verdict RTL en production

Date : 26 septembre 2026

Production fonctionnelle : `f896272b165ef531231dc6c7fd2b6f93dc107f27`

Route contrôlée : `https://qalem.ma/app`

Preuve : `docs/evidence/s0-012-rtl-app-production-2026-09-26.png`

SHA-256 : `36613b2f5d1c3beb9aaa3feb9eadb5f4c5fcbeef0f43c549e6821695706e4aed`

## Contrôles objectifs

Une session temporaire du super-administrateur existant a ouvert la production avec `locale=ar-MA`, sans création de compte ni mutation de tenant.

- `html[dir]` vaut `rtl` ;
- `html[lang]` vaut `ar-MA` ;
- la largeur du document est identique à celle de la fenêtre, soit `1585 px`, sans débordement horizontal ;
- la navigation globale est placée à droite ;
- le formulaire principal, les barres d’actions et la grille des formations sont visiblement réordonnés de droite à gauche ;
- les textes arabes visibles sont liés correctement, sans mojibake.

## Limite de la preuve

Cette capture prépare le premier écran P0, mais ne remplace ni l’examen des autres écrans de `docs/foundation/0-socle/checklist-rtl.md` ni le verdict humain obligatoire. `S0-012` reste donc `to_validate/passes=false`.
