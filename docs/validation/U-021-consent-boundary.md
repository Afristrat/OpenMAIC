# U-021 — Consentement : identité, persistance et interface

## Candidat du 10 septembre 2026

Feu vert : `docs/decisions/2026-09-09-unblock-prd.md`. Pas de clôture ni de déploiement dans cette itération.

- GET/POST utilisent `requireAuth`, donc `auth.getUser()` côté serveur. Le client ne choisit plus le bénéficiaire d’une écriture ; lecture pour autrui refusée.
- POST impose origine attendue et JSON strict, limite le corps à 1 Kio et sa lecture à cinq secondes. Lecture/écriture Supabase bornées à cinq secondes.
- Absence de choix distincte du refus : `pedagogy_consent_decided_at` porte la décision explicite. La migration `20260910100000` retire les anciens défauts trompeurs et traite les anciennes valeurs `false`, sans trace de décision séparée, comme non décidées ; toute collecte reste refusée tant que l’opt-in n’a pas été effectué. Les erreurs de stockage renvoient 503 au lieu d’un faux succès.
- Le layout privé transmet l’identité déjà vérifiée côté serveur à la bannière ; son affichage ne dépend donc plus d’une seconde hydratation Auth navigateur. Le profil conserve le contrôle permanent de retrait. Ancienne préférence globale localStorage ignorée ; changement de compte remonte le contrôle.
- Libellés FR/AR/EN, boutons de même importance, erreurs visibles. Pseudonymisation explicitement distinguée de l’anonymat. Aucun nouveau collecteur activé.

## Preuves disponibles et recette à refaire

ServeurIA uniquement, runner `qalem-refork-exec`, dossier `.codex-gate-s3-008-fe6ebba` :

- 14 tests API : identité, refus/accord, absence de choix, erreur de stockage, origine, JSON, taille.
- 2 tests stockage : absence de ligne, échec de lecture et d’écriture.
- Session 92684, exit 0 : seize tests API/stockage, TypeScript et lint global sans avertissement. Session finale 26405, exit 0 : TypeScript, lint du composant et quatre parcours navigateur après désactivation des boutons pendant la lecture initiale ; aucune réponse de lecture tardive ne peut ainsi écraser une modification déjà engagée.
- Session 71033, exit 0 : TypeScript, lint global sans avertissement et quatre parcours Playwright sans retry. Refus persistant après rechargement, accord, retrait, ancienne clé locale ignorée, trois langues et RTL ; échec 503 puis nouvelle tentative.
- Première exécution navigateur : deux échecs de contrat console, dus aux requêtes interrompues par la navigation et au profil non simulé. La recette attend les réponses avant navigation et simule explicitement le profil ; aucune erreur masquée.
- Base réelle : RLS activée sur `telemetry_consent`, politique propriétaire `auth.uid() = user_id`. Accord puis refus sur le profil synthétique existant, un résultat vrai puis faux, transaction `ROLLBACK` réussie. Aucune préférence durable changée. Ce contrôle SQL ne constitue pas une recette de l’API authentifiée déployée.

Le 10 septembre, la recette GoTrue/Next/SQL a révélé deux défauts du candidat :

1. Le `false` initial de la table était interprété à tort comme un refus déjà choisi, donc une nouvelle personne ne voyait jamais la bannière.
2. Sur un parcours SSR, la bannière redemandait l’identité au navigateur alors que le layout l’avait déjà vérifiée côté serveur.

Les deux causes sont corrigées dans le code et couvertes par les tests ciblés API, stockage et layout. La recette navigateur complète doit être rejouée avec un environnement isolé neuf : l’ancien environnement a été détruit après l’exposition d’un jeton de recette éphémère. Aucune donnée de production n’était présente ni modifiée.

## Inventaire et limites

Recherche des appelants : `collectPedagogyData` et `collectDiscussionData` n’ont aucun consommateur applicatif retrouvé. L’outbox xAPI ANCRER a déjà des producteurs et un worker ; son autorisation et son périmètre doivent être traités séparément dans S-035/U-018, sans prétendre que ce seul booléen couvre toute la télémétrie.

Restent le raccordement atomique collecte/consentement et la suppression S-036/S-047, l’inventaire d’activation réelle xAPI, le gate global et la recette publiée. U-021 conserve `passes=false`.

Références consultées : [changelog Supabase](https://supabase.com/changelog), [identité vérifiée getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [observabilité](https://supabase.com/docs/guides/observability). Ponytail : composant, table et mécanisme d’authentification existants, aucune dépendance ajoutée.

## 24 septembre 2026 — Cadrage contractuel livré

La décision produit remplace le candidat du 10 septembre : l’analyse pseudonymisée
des parcours d’apprentissage et de l’interface fait partie intégrante du service
authentifié et des conditions d’utilisation. Elle n’est donc plus présentée comme
un choix individuel. Le partage vers un LRS externe par xAPI reste distinct,
désactivé par défaut et révocable depuis le profil.

La migration `20260924120000_contractual_learning_analytics.sql` est appliquée en
production après sauvegarde du schéma et prévol transactionnel. La relecture
retrouve 17 lignes sur 17 avec `pedagogy_consent=true`, aucune autorisation xAPI,
la contrainte `telemetry_learning_analytics_required`, le déclencheur de
provisionnement des nouveaux profils et aucune politique permettant une
modification directe de cette base contractuelle. Le `POST`
`/api/telemetry-consent` n’accepte plus que `purpose=xapi`.

Le SHA fonctionnel `febdd96f544c54462252f69dbad6367e0c05faf9` passe Prettier,
TypeScript, ESLint, 546 fichiers et 3 366 tests Vitest, le build de 127 routes et
196 scénarios Playwright sans échec. Le défaut transverse d’hydratation rencontré
pendant la gate venait des dates de marketplace calculées avec la locale et le
fuseau implicites du serveur et du navigateur ; elles utilisent désormais une
date calendaire UTC déterministe. Le déploiement Coolify
`pbzpbfhh8iuehoiyx9av3lcn` sert l’image exacte de ce SHA. Le conteneur est
`healthy`, `restart=0`, `OOMKilled=false`, sans journal critique depuis son
démarrage, et `https://qalem.ma/api/health` répond HTTP 200.

La recette permanente
`scripts/proofs/u021-contractual-analytics-production.mjs`, validée au SHA
`b972f5cac3c3202afce9e927c0ea8656d7fc1d2f`, crée un compte éphémère puis prouve
sur `https://qalem.ma` : accès anonyme refusé, analyse interne provisionnée et
non modifiable, xAPI à `false` par défaut, contrôle limité au profil, activation
et retrait effectifs, renouvellement de l’epoch et conservation de l’analyse
interne. Le compte et sa ligne de télémétrie sont supprimés en fin de recette.
U-021 est clôturée ; le transport vers un LRS et sa politique d’effacement
restent volontairement suivis par S-035, pas par cette story.
