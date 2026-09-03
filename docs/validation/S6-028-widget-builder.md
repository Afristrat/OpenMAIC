# S6-028 — Génération, prévisualisation et publication d’un widget

Date de certification : 3 septembre 2026  
SHA fonctionnel : `669e49f19a9ecbc72d8f0ce59f9884b3d7a21606`  
Déploiement Coolify : `vzsdj7j3r54j3qbjybnkej14`

## Résultat

L’administration propose désormais un builder en langage naturel, sans JSON ni glisser-déposer. Le fournisseur et le modèle proviennent exclusivement du routage LLM administré côté serveur. L’interface permet de corriger la demande, régénérer, prévisualiser, puis publier uniquement après une prévisualisation réussie. Elle est localisée en français, arabe RTL et anglais, et reste inaccessible aux administrateurs tenant.

Le modèle actuellement routé, `deepseek-v4-flash`, ne prend pas en charge `response_format` et peut produire un JSON imparfait. Le code n’impose donc aucun format propriétaire au fournisseur : il parse la réponse textuelle, applique le schéma strict, contrôle références, cycles, bornes, calculs et direction, calcule côté serveur un cas de référence omis, puis effectue une seule réparation guidée par les erreurs exactes du validateur. Une seconde sortie invalide est rejetée avec HTTP 502 ; elle ne peut jamais atteindre la prévisualisation ni la publication.

## Preuves

- TDD : échecs initiaux prouvés pour la route absente, l’étape de routage inconnue, l’interface absente, le modèle sans sortie structurée, le cas de référence omis et la réparation manquante.
- Tests ciblés finaux : 10/10 pour l’API, dont refus tenant, absence de modèle/endpoint fourni par le client, validation sémantique, cas de référence déterministe et réparation bornée.
- Playwright ciblé : parcours complet FR, arabe RTL, anglais et refus administrateur tenant.
- Production réelle sur `https://qalem.ma` : génération HTTP 200, prévisualisation HTTP 200 et publication HTTP 200 ; widget obtenu « Calculateur de marge ».
- Nettoyage : 1 publication, 1 version et 1 template de preuve supprimés ; contrôle final agrégé à zéro.
- Session de preuve : l’unique session créée à 16:14:40 UTC a été supprimée directement de `auth.sessions`, puis contrôlée à zéro. Les fichiers de session sont absents de l’hôte et du conteneur.
- Incident de preuve antérieur : le lien magique à usage unique apparu dans une sortie a été consommé immédiatement, donc invalidé ; aucun secret durable n’a été exposé.

## Gate et exploitation

- Prettier, TypeScript et ESLint : verts ;
- Vitest : 416/416 fichiers, 2 626/2 626 tests ;
- build Next.js : 106/106 routes ;
- Playwright Chromium : 101/101 avec `--retries=0`, en 3,8 minutes ;
- conteneur production exact : `bcx5pxyuc9z3lt4jtyjipcqu-170113034300`, `healthy`, zéro redémarrage, `OOMKilled=false` ;
- santé publique : HTTP 200 ;
- journaux critiques récents : zéro occurrence fatale, OOM, exception non interceptée ou promesse non gérée.

La consommation des widgets publiés par les auteurs et leur export statique relèvent de S6-029.
