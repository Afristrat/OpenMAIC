# S-037 — Optimiseur, candidat sans minimum de sessions

Feu vert du 9 septembre 2026 consigné dans
`docs/decisions/2026-09-09-unblock-prd.md`. Aucun passes=true à ce stade.

Le module existant utilise la première observation exploitable. Une séquence
vide, des scores absents, non finis ou hors [0,1] ne deviennent pas des échecs
d’apprentissage. Les séquences sont groupées sans collision de séparateur ;
les égalités sont déterministes. Ajustement heuristique borné à ±0,2.

Le résultat expose le volume total, celui de la séquence retenue et les scores
observés, avec evidence=observational. Le champ confidence fondé arbitrairement
sur le volume a été supprimé. Aucun appelant existant trouvé par recherche.

La requête exige une liste de formations autorisées fournie par le serveur,
ne fait rien sans cette liste, filtre sujet/niveau/langue et utilise les mille
observations les plus récentes au maximum, avec un délai de cinq secondes.
Ce plafond borne la mémoire ; il ne constitue pas un minimum d’observations.
L’authentification et la construction de la liste restent à raccorder côté appelant.
Les erreurs de configuration, de transport ou de base rendent null, sans
imprimer les détails du fournisseur.

ServeurIA, session 45654 terminée exit 0 : 8/8 tests ciblés, TypeScript et lint
global sans avertissement. Les trois avertissements du test négatif sont les
messages applicatifs attendus, pas des avertissements ESLint.
Le schéma SQL existant définit déjà des scores normalisés [0,1] ; aucune
migration ni collecte n’est activée par ce lot.

Restent : données consenties et révocables de S-036, contexte autorisé construit
côté serveur, application de la suggestion au pipeline sans contredire les choix
de l’auteur, affichage de ses limites, recette navigateur et protocole de mesure.
Pas de gain andragogique déclaré ni de déploiement de ce candidat.

Ponytail : réemploi du client de service, de Zod et du logger, aucune dépendance.
La skill Supabase a conduit à vérifier la requête bornée et à préserver les
frontières d’autorisation. Référence :
[limitation des résultats](https://supabase.com/docs/reference/javascript/using-modifiers-limit).
