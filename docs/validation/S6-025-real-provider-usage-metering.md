# S6-025 — Décompte et valorisation des usages fournisseurs réels

## Verdict

S6-025 est certifiée au SHA fonctionnel `cd3109a9c2f1a64de8e99be6676fe7564163dac4`, poussé sur `origin/refork-v030` et déployé en production le 2 septembre 2026. Les appels fournisseurs exécutés dans un contexte tenant authentifié produisent désormais une réservation, un rapprochement sur la quantité réelle, un débit de crédits et un snapshot économique idempotents.

## Frontière de confiance et couverture

- L’organisation est vérifiée côté serveur par les contrôles d’appartenance ou d’autorisation avant l’ouverture du contexte de mesure.
- `runWithUsageMeteringContext()` maintient l’acteur, le tenant et la clé d’idempotence pendant toute la continuation asynchrone. Les anciennes activations effectuées dans les helpers d’authentification, qui perdaient leur contexte au retour de `await`, ont été supprimées.
- Les chemins LLM, chat live, TTS, ASR, image, vidéo, stockage de média et recherche web utilisent la même orchestration `reserve → execute → settle`, ou `reserve → execute failed → release`.
- Le taux de consommation des crédits reste une version tenant explicite. Il ne dépend ni du prix vendu, ni du coût fournisseur, ni de la cible de marge.
- Les jobs persistants activent leur contexte à partir de l’acteur, du tenant et de leur identifiant stable ; les routes interactives dérivent la clé depuis l’en-tête `Idempotency-Key` validé.

## Quality gate sur ServeurIA

Toutes les commandes ont été exécutées dans l’image `qalem-validation:playwright-1.58.2-ffmpeg`, sur le checkout détaché exact `cd3109a` :

| Contrôle | Résultat |
|---|---:|
| Prettier | vert |
| TypeScript `tsc --noEmit` | 0 erreur |
| ESLint | 0 erreur |
| Vitest | 408/408 fichiers, 2 591/2 591 tests |
| Build Next.js | 103/103 pages |
| Playwright Chromium | 89/89 scénarios, 3,8 min |

Le premier lancement Playwright avec `--network host` a rencontré `EADDRINUSE` parce que Cal.com occupe légitimement le port hôte `3002`. Aucun service n’a été arrêté : Playwright a été relancé dans un réseau Docker isolé, où les 89 scénarios ont réussi.

## Déploiement exact

- Web Coolify : déploiement `arckml35j5utbchkt6gwu23k`, terminé au SHA exact.
- Runtime Coolify : déploiement `k2j24a03pji503r88a9gkpaw`, terminé au même SHA.
- Web, worker et capture-worker : `healthy`, `RestartCount=0`, `OOMKilled=false` et `SOURCE_COMMIT=cd3109a9c2f1a64de8e99be6676fe7564163dac4`.
- `ffprobe 8.1.2` est disponible dans le runtime.
- `http://qalem.ma/api/health` répond 200 avec les capacités recherche web, image, vidéo et TTS actives.

## Recette de production

Un tenant temporaire entièrement tarifé sur l’unité `operation` a été activé avec :

- allocation : 10 000 microunits de crédits ;
- burn rate : 1 000 microunits de crédits par opération ;
- prix vendu à la valeur : 20 000 000 microunits USD par opération ;
- coût Serper indépendant : 1 000 microunits USD par opération.

### Usage Serper réel

L’appel authentifié à `/api/web-search`, fournisseur `serper`, a répondu 200 et retourné huit sources. La base de production a enregistré :

- réservation `5195f205-8898-4924-a83e-341e67e85136`, statut `settled` ;
- quantité maximale et réelle : 1 opération ;
- crédits réservés et réellement débités : 1 000 ;
- revenu : 20 000 000 microunits ; coût : 1 000 microunits ; marge arrondie : 10 000 points de base ;
- solde final : 9 000 microunits.

Le même appel a ensuite été rejoué avec la même clé d’idempotence. Le résultat est resté à une réservation, une valorisation et trois écritures ledger liées ; le solde est resté à 9 000. Aucun double débit ni double snapshot n’a été créé.

### Compensation d’échec

La réservation de contrôle `4acee570-79b2-4b20-8443-8868a4c0c7ca` a temporairement fait passer le solde de 9 000 à 8 000. La libération avec le motif « Échec fournisseur simulé pendant la recette S6-025 » a restauré exactement 9 000 : statut `released`, deux écritures ledger compensées, aucune quantité réelle et aucune valorisation.

## Nettoyage

L’organisation temporaire `898516a9-0b35-4014-afac-f9701976ac43` et l’utilisateur Auth `ffebcbf2-3e32-4328-adae-3cbe92ce7233` ont été supprimés. Les contrôles finaux retournent zéro pour : organisation, membre, contrôle de facturation, burn rate, wallet, ledger, prix vendu, réservation, valorisation, profil et utilisateur Auth.

Les fichiers temporaires de recette et de concurrence ont été supprimés de ServeurIA. Le coût fournisseur permanent `serper / serper / operation / USD` demeure présent. Confiance de déploiement : **1,0**.
