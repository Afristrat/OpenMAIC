# 11 — Frontière de publication du moteur

Date de vérification : 2026-07-21  
Vecteur : V-01

## État prouvé

- Le dépôt GitHub `Afristrat/OpenMAIC` est public.
- GitHub détecte sa licence comme MIT ; `LICENSE` et `package.json` déclarent également MIT.
- Le corpus canonique `formation-design-pro` n'est pas suivi dans ce dépôt.
- Deux artefacts Qalem historiques sont déjà publics sous `skills/formation-design-pro/`. Leur état exact est enregistré dans `publication.json` par chemin, empreinte SHA-256 et premier commit connu. Une comparaison SHA-256 contre les 65 fichiers de la source OneDrive n'a trouvé aucun doublon binaire exact.
- La dette de provenance AGPL du code historique est distincte : S0-014 reste ouverte. Elle ne justifie pas d'introduire le corpus privé dans ce dépôt.

Ce constat décrit l'exposition existante. Il ne constitue ni une nouvelle concession de licence, ni un avis juridique, ni une validation de la future licence commerciale du corpus.

## Contrat exécutable

`.formation-engine-boundary.json` impose les règles suivantes :

1. la source canonique est privée, externe et non suivie dans Qalem ;
2. les emplacements d'entrée privée sont explicitement ignorés par Git ;
3. chaque publication Qalem possède un manifeste de provenance ;
4. chaque fichier publié est exhaustivement listé et lié à une empreinte SHA-256 ;
5. tout ajout, retrait ou changement silencieux fait échouer `tests/skills/formation-engine-boundary.test.ts`.

Le contrôle ne prétend pas décider si un texte est juridiquement redistribuable. Cette décision reste hors de la délégation ADR-404. Il empêche cependant qu'un futur build copie le corpus canonique par accident et rend toute évolution de l'artefact visible et vérifiable.

## Sources

- État réel du dépôt : `gh repo view --json visibility,licenseInfo`, exécuté le 2026-07-21.
- Licence locale : `LICENSE` et `package.json`, lus le 2026-07-21.
- GitHub explique qu'une licence ouverte permet l'usage, la modification et la distribution du projet : <https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository>.
- SPDX recommande des métadonnées de licence précises et lisibles par machine au niveau des fichiers : <https://spdx.dev/learn/handling-license-info/>.

## Limite explicitement conservée

V-06 décidera le protocole déterministe de compilation et les deux sorties. V-01 ne crée pas le futur dépôt privé et ne publie aucun contenu hors de Qalem.
