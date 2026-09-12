# Incident — Exposition par sérialisation Coolify du 12 septembre 2026

Une commande de diagnostic a sérialisé un modèle Coolify complet au lieu de sélectionner uniquement des métadonnées non sensibles. Les identifiants concernés doivent être traités comme compromis.

Aucune valeur ne figure dans cet artefact. À cette date, aucune rotation n’est certifiée : tout déploiement Qalem reste suspendu jusqu’à la rotation coordonnée des consommateurs et fournisseurs concernés, suivie d’une vérification de non-régression.

Prévention : les diagnostics Coolify doivent sélectionner explicitement des champs non sensibles et ne jamais sérialiser un modèle ou une relation complète.
