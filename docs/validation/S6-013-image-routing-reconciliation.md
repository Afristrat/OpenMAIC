# S6-013 — Réconciliation du routage image

Date : 14 septembre 2026

## Cause racine établie

La clé virtuelle LiteLLM de Qalem autorisait vingt modèles, mais aucun des
modèles d’image administrés. Le relais LiteLLM était donc joignable, tandis que
la génération d’illustration de formation échouait par refus d’autorisation du
fournisseur.

## Correction bornée

Les autorisations existantes de la clé Qalem ont été conservées et deux
modèles d’image administrés ont été ajoutés : le modèle d’illustration courant
et son repli. Le nombre d’autorisations est passé de vingt à vingt-deux, sans
retrait.

Les variables `IMAGE_OPENAI_API_KEY` des variantes production et
prévisualisation de Qalem Runtime ont été remplacées par cette clé virtuelle
via l’API Coolify. L’URL n’a pas été changée : le worker actif établit qu’elle
est déjà identique au relais LLM général. Aucune valeur de clé, d’URL privée,
d’image ou de réponse fournisseur n’est consignée.

## Vérification effective

Après redéploiement, le nouveau worker Qalem est `healthy`. Son environnement
charge la même clé virtuelle pour l’image et le LLM général. Un appel image
minimal exécuté depuis ce worker retourne HTTP 200 et une réponse contenant une
image. Le même appel direct via LiteLLM avait déjà retourné HTTP 200.

Cette preuve rétablit le maillon image du runtime. Elle ne clôt pas S6-013 :
la recette authentifiée complète doit encore rejouer la formation depuis une
source autorisée jusqu’aux scènes, ressources, reprise, quiz/PBL et export
MP4, puis nettoyer ses données de recette.
