# Contrat de double publication

La source canonique du moteur de formation vit dans un dépôt Git privé externe. Une révision propre produit exactement deux cibles : `standalone`, pour la skill autonome, et `qalem`, pour l’intégration à la plateforme.

## Conditions de publication

- La source doit être un worktree Git propre et `HEAD` doit fournir l’identifiant complet de la révision.
- `publication-plan.json` doit respecter `publication-plan.schema.json` et déclarer exactement les deux cibles.
- Chaque cible doit porter une approbation de redistribution explicite et une référence vérifiable.
- Seuls les fichiers énumérés sont copiés. Les liens symboliques, chemins traversants, noms sensibles et clés privées sont refusés.
- La destination doit être absente ou vide. Le compilateur n’efface jamais un ancien livrable et ne mélange jamais deux révisions.
- Chaque cible reçoit un `publication.json` contenant la même révision source, le hash du plan et le SHA-256 de chaque fichier.
- Aucun horodatage n’entre dans le résultat : deux exécutions sur la même révision et le même plan doivent produire les mêmes octets.

## Exécution

```text
pnpm publish:formation-engine -- --source <dépôt-privé> --output <répertoire-vide>
```

Le compilateur construit des artefacts locaux contrôlables. Il ne crée pas le dépôt privé, ne publie rien sur un service externe et ne vaut pas validation juridique de redistribution.
