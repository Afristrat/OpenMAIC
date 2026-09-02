# U-008 — Page « Mes certificats »

## Verdict

U-008 est certifiée au SHA fonctionnel `b987a5d020cd9c52727374370ed2333084797665`, poussé sur `origin/refork-v030` et déployé en production le 2 septembre 2026. Un bénéficiaire authentifié retrouve son certificat après rechargement, peut le consulter dans les trois langues Qalem et ne peut lire aucun certificat appartenant à un autre utilisateur.

## Correction livrée

- La page authentifiée ne lit plus directement la table Supabase depuis le navigateur. `GET /api/certificates` authentifie la session côté serveur, sélectionne explicitement les colonnes utiles et borne la requête à `user_id`.
- Une erreur de chargement produit désormais un état explicite et récupérable, au lieu d’être confondue avec une liste vide.
- Les états vide, erreur et consultation sont couverts en français, anglais et arabe marocain, avec direction RTL en arabe.
- La migration `00058_secure_certificate_visibility.sql` supprime la politique `Public verification lookup` dont la condition effective était `true`.
- La vérification publique reste disponible exclusivement par `/api/certificates/verify/[code]`, qui utilise le rôle de service côté serveur et ne renvoie que les champs publics prévus.

## Preuves TDD et automatisées

Les parcours navigateur ont d’abord échoué au SHA `5347bf4d522fd4177ea782675e8a63526a6cea3e` : la page appelait encore directement `/rest/v1/certificates`, perdait le certificat et n’affichait aucun état d’erreur. Les contrats API ont échoué au SHA `a0796ad1b47a365ab5139ebd70823b70d902745d` : route de liste absente et vérification publique répondant 500 lorsqu’un client de session visiteur était interdit. Le test de migration a échoué au SHA `55a771da89399da2881ca190dff486afb7a5ee8b` faute de migration. Les mêmes preuves sont vertes au SHA fonctionnel.

Le gate complet a été exécuté sur ServeurIA dans l’image `qalem-validation:playwright-1.58.2-ffmpeg`, sur l’arbre suivi exact du SHA fonctionnel :

| Contrôle | Résultat |
|---|---:|
| Prettier | vert |
| TypeScript `tsc --noEmit` | 0 erreur |
| ESLint | 0 erreur et 0 avertissement |
| Vitest | 412/412 fichiers, 2 600/2 600 tests |
| Build Next.js | 104/104 pages |
| Playwright Chromium | 97/97 scénarios, 4,2 minutes |

Les cinq nouveaux scénarios Playwright couvrent la persistance après rechargement, la consultation, l’état vide FR/EN/AR, le RTL arabe et l’état d’erreur récupérable. Les cinq tests unitaires couvrent l’anonyme, le bénéficiaire, l’erreur de base, la vérification publique confinée au serveur et la migration RLS.

## Migration et déploiement

Avant migration, la lecture système de `pg_policies` sur la base réellement servie par `db.qalem.ma` retournait :

```text
Authenticated users create own certificates|
Public verification lookup|true
Users see own certificates|(auth.uid() = user_id)
```

Le Dockerfile web n’exécute aucune migration. `00058_secure_certificate_visibility.sql` a donc été appliquée explicitement avec `psql -v ON_ERROR_STOP=1` sur `supabase-db-lkqqmwsn5zydykuv3gd6q7ws`. La relecture effective ne conserve que les politiques de création et de lecture propriétaire ; aucune politique `USING (true)` ne subsiste.

- Application Coolify : `bcx5pxyuc9z3lt4jtyjipcqu` (`qalem-web-rolling-candidate`).
- Déploiement : `hozt48kbaou5bz0qpsffweir`, terminé au SHA exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-181158388780`.
- Image : `bcx5pxyuc9z3lt4jtyjipcqu:b987a5d020cd9c52727374370ed2333084797665`.
- État après basculement : `healthy`, `RestartCount=0`, `OOMKilled=false`.
- `https://qalem.ma/api/health` répond 200.

Le runtime Qalem, ses workers, LiteLLM et Hostinger n’ont pas été redéployés.

## Recette de production

Une recette sans mock a créé deux comptes Auth, un stage et un certificat strictement temporaires :

1. la lecture directe de `certificates` avec le rôle anonyme renvoie 200 et zéro ligne ;
2. `/api/certificates` sans session renvoie 401 ;
3. la vérification publique par code renvoie 200 et le certificat attendu ;
4. le bénéficiaire voit le certificat, le retrouve après rechargement et ouvre sa consultation ;
5. la même session affiche les titres et directions attendus en `fr-FR:ltr`, `en-US:ltr` et `ar-MA:rtl` ;
6. l’utilisateur extérieur obtient l’état vide et zéro occurrence du certificat.

L’état d’erreur n’a pas été provoqué artificiellement en production : il est couvert par le parcours Playwright déterministe qui force une réponse 503 et vérifie le message localisé ainsi que l’action « Réessayer ».

## Nettoyage

Le bloc de nettoyage s’exécute même en cas d’échec intermédiaire. Après la recette réussie, les compteurs sont revenus à zéro pour les certificats, stages et comptes Auth préfixés `u008-`. Le script de recette, le clone de validation supplémentaire et tous les fichiers éphémères ont été supprimés du poste et de ServeurIA.
