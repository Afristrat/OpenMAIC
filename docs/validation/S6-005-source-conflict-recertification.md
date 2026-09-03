# S6-005 — Reformulation fondée sur les sources

## Recertification du 3 septembre 2026

Le SHA fonctionnel déployé `9935016ced2aedbc4a633eeec4179c449952a002`
conserve une seule frontière d’alignement avant la génération du plan. Elle
compare la demande au texte réellement extrait, refuse de déduire le thème du
nom de fichier et ne conserve que les extraits littéraux présents dans la
source. Une réponse contradictoire ou incertaine sans proposition et référence
valides échoue fermée après un unique nouvel essai.

Le dialogue rend visibles la divergence, les références et la proposition
éditable. L’auteur peut revenir à sa demande, retirer ou changer ses sources,
ou transmettre explicitement la reformulation, éventuellement modifiée. Aucun
remplacement silencieux n’alimente le plan.

Sur ServeurIA :

- `classroom-plan-source-alignment` et `classroom-plan-job-runner` : 7/7 tests ;
- `home-to-generation.spec.ts` : 14/14 tests, dont conflit, alignement, source
  vide, acceptation modifiée et dialogue fr-FR, ar-MA RTL et en-US ;
- journaux SHA-256 :
  `2f29eea48798a46821f8a03da2895631a56a3b2c26e69919abd65e6a7413ce5f`
  pour Vitest et
  `6e9f69ad3df6f2d743da206332d9faf7aa83fc7e4429bd0c447d43f23f8951b0`
  pour Playwright.

Le gate complet du même graphe passe Prettier, TypeScript, ESLint, 420 fichiers
et 2 640 tests Vitest, le build Next.js de 107 routes et 105 tests Playwright
sur 105.
