# S-048 — Director candidat sans minimum d’observations

Feu vert reçu et décisions dans docs/decisions/2026-09-09-unblock-prd.md.
Le minimum historique de cinquante observations est supprimé. Un pattern
valide peut être utilisé dès sa première observation, y compris avec un score
zéro. Les données absentes, non finies, hors [0,1] ou incohérentes sont ignorées.

L’agrégation conserve séparément les séquences d’agents et d’interventions,
au lieu de fusionner des discussions différentes. La suggestion vérifie le
préfixe déjà joué et les agents encore disponibles, choisit le meilleur score
même dans une entrée non triée et départage les égalités de façon déterministe.
Elle retourne agentId, sampleSize, observedMeanQuizScore et evidence=observational.
Aucun appelant actuel trouvé : le raccordement reste à faire.

Le client de service commun remplace le client non typé dupliqué. Liste de
formations autorisées obligatoire, contexte sujet/langue, mille lignes maximum,
délai cinq secondes et fallback vide sur erreur sans exposer de détail privé.
La construction autorisée et consentie de cette liste reste une responsabilité
du futur appelant serveur, pas une preuve fournie par ces tests de module.

La cohorte v1 utilise SHA-256 avec un préfixe d’expérience et un identifiant de
session serveur. Répartition attendue 50/50, pas quota garanti sur un petit
échantillon. Une session vide reste classique. Aucune expérience activée.

ServeurIA, session 67933 exit 0 : 10 tests Director + 8 optimiseur, TypeScript
et lint global sans avertissement. Requête de compatibilité réelle en lecture
seule : HTTP 200 et zéro ligne sur une formation sentinelle non existante.
Cela vérifie le schéma/filtrage, pas une amélioration sur des données réelles.
Pas de collecte, migration, déploiement, gate global ou validation navigateur.

Restent : collecte consentie S-047, raccordement aux décisions réelles,
protocole de mesure/arrêt A/B consigné, effets observables et recette complète.
S-048 demeure passes=false.
