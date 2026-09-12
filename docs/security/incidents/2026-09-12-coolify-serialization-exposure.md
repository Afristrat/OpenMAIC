# Incident — Exposition par sérialisation Coolify du 12 septembre 2026

Une commande de diagnostic a sérialisé un modèle Coolify complet au lieu de sélectionner uniquement des métadonnées non sensibles. Les identifiants concernés doivent être traités comme compromis.

Aucune valeur ne figure dans cet artefact. Les secrets de webhooks des trois applications Qalem ont été régénérés le 12 septembre 2026 par une mutation interne ne renvoyant aucune valeur. Les quatre enregistrements du jeton capture, historiquement stockés en clair et donc incompatibles avec le déchiffrement Coolify, ont été remplacés par une valeur nouvelle chiffrée et vérifiée par métadonnées. Cette valeur ne sera effective qu’après redéploiement coordonné. La clé Resend Qalem refuse l’inventaire des clés fournisseur avec HTTP 400 : son droit ne permet pas d’identifier ou de révoquer de manière sûre une clé partagée. Les clés fournisseurs restantes et la paire LTI restent à faire : tout déploiement Qalem reste suspendu jusqu’à leur rotation coordonnée et à une vérification de non-régression.

Prévention : les diagnostics Coolify doivent sélectionner explicitement des champs non sensibles et ne jamais sérialiser un modèle ou une relation complète.
