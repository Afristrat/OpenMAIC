# S6-027 — Persistance des templates de widgets

Date de certification : 2 septembre 2026  
SHA fonctionnel : `04db143d49e455d54c59c7d3dd45624aea731c26`  
Déploiement Coolify : `szqaapqsmve5qa4huvfasrqi`

## Résultat

La migration `00059_widget_templates.sql` persiste les templates globaux, leurs versions numérotées, les pointeurs vers le brouillon courant et la version publiée, ainsi que chaque publication auditée. Une révision ajoute toujours une nouvelle version. Le contenu d'une version publiée ne peut plus être modifié ni supprimé.

Les utilisateurs authentifiés peuvent lire les templates publiés et uniquement leurs versions publiées. Ils ne disposent d'aucun droit direct d'insertion, de modification ou de suppression. Les trois fonctions atomiques sont retirées à `PUBLIC` et accordées au seul `service_role` ; les routes vérifient en amont le rôle super-administrateur.

## Preuves

- Rouge initial `106a6a2` : migration et quatre routes inexistantes.
- Preuve ciblée : 9/9 tests couvrant migration, RLS, création, révision, prévisualisation, publication, validation du contrat et refus d'un administrateur tenant.
- Base éphémère : migration appliquée, versions 1 puis 2, publication 2, visibilité RLS 1 template/1 version, audit 1, mutation refusée, version exacte retrouvée après redémarrage.
- Production : mêmes versions et publication, relecture exacte après nouvelle connexion, mutation immuable refusée, écriture `authenticated` refusée.
- Nettoyage production : templates, versions et audits revenus à `0|0|0` ; tous les artefacts temporaires ont été supprimés.

## Gate et exploitation

- Prettier, TypeScript et ESLint : verts ;
- Vitest : 415/415 fichiers, 2 615/2 615 tests ;
- build Next.js : 105/105 pages ;
- Playwright Chromium : 97/97 avec `--retries=0`, en 4,0 minutes ;
- conteneur production exact : `healthy`, zéro redémarrage, `OOMKilled=false` ;
- santé publique : HTTP 200 ;
- création, révision, prévisualisation et publication anonymes : HTTP 401.

La génération IA et l'interface de correction/régénération relèvent de S6-028. La consommation auteur et l'export statique relèvent de S6-029.
