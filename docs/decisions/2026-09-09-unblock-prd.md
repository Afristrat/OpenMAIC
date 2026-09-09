# PRD 3 — Décisions après feu vert du 9 septembre 2026

Mandat : « fais ce que tu as à faire, feu vert pour le reste avec la meilleure option dans chaque cas ».
Les douze verrous d’exécution sont levés. Les anciens statuts et gaps décrivent
des restes, pas une nouvelle demande d’autorisation. Aucun passes=true déduit.

- S6-014 : rotation autorisée dans Qalem, par catégories et consommateurs,
  avec inventaire, sauvegarde, remplacement contrôlé et vérification avant révocation.
  Aucun secret d’un autre projet n’est modifié.
- S2-008 : conserver AudioSeal MIT et le protocole composite. Isoler le worker,
  borner mémoire/concurrence et vérifier les artefacts/licences réellement utilisés
  avant distribution. L’autorisation produit n’est pas une certification juridique.
- S-019/S-020/S-021 : intégration via Diwan, un seul accès documentaire côté Qalem.
  Pas de deuxième connecteur direct. Aucun droit d’écriture dans le dépôt Diwan
  n’est déduit de ce choix ; le contrat et les accès fournisseur restent nécessaires.
- U-021/S-036/S-047 : collecte détaillée des interactions utiles à l’apprentissage
  et à l’UX, uniquement après consentement explicite, avec refus et retrait.
  Ce choix remplace le cadrage antérieur du consentement implicite dans les CGU.
  Éviter les contenus bruts quand les événements structurés suffisent ; isoler
  les tenants, prévoir suppression et durée de conservation explicite avant activation.
  Ne pas qualifier les identifiants hashés d’anonymes.
- S-035/U-018 : conserver les événements quiz, consultation de scène, résolution
  de mise en situation et discussion. Réutiliser l’outbox xAPI existante, séparer
  les événements de cours et d’ANCRER ; statut/test administrateur sans credentials.
- S-037 : ajustements dès la première observation exploitable ; volume et scores
  observés explicites, jamais assimilés à une preuve de gain ou de confiance statistique.
- S-048 : même règle sans minimum ; A/B déterministe 50/50 au niveau de la session,
  cohortes stables, mesure prédéfinie du score post-discussion et des échecs/latences,
  arrêt en cas de dégradation technique, aucun basculement global fondé sur un gain supposé.
  Consigner le protocole détaillé avant activation ; son élaboration est déléguée.

L’autorisation de coder ne ferme pas les checkpoints humains (appareils physiques,
écoute, validation visuelle), ni ne prouve la livraison des services externes.
Une story par itération ; première correction : S-037, sans activation de collecte.
