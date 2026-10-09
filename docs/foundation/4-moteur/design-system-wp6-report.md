# Rapport WP6 — Tokens pour les scènes interactives HTML

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Commit : `b2eeaa23`

## Résultat

Les cinq générateurs HTML concernés (simulation, diagramme, jeu, code et
visualisation 3D) reçoivent, lorsque le système de design est opt-in, un module
de consignes commun inférieur à 1 500 caractères. La réponse générée reçoit un
bloc de variables CSS calculé à partir de la directive et de l’instantané de
charte : surfaces, textes, trois accents, états fonctionnels, variantes de
contraste, rayon et familles de polices.

Le bloc injecté est autonome : il ne télécharge pas de police et fixe le focus
visible, la taille minimale des boutons et les familles de repli. Le code
existant établit que les iframes de scène sont isolées par `sandbox` sans
`allow-same-origin`. Le endpoint de plugins autorise les styles inline mais ne
déclare aucune source de polices ; aucune police distante n’est donc supposée
disponible.

Sans directive ni instantané, le HTML interactif hérité reste inchangé. Le
comportement précédent n’est donc pas imposé aux tenants non activés.

## Preuves au commit `b2eeaa23`

- Formatage, TypeScript et ESLint : code de sortie 0.
- Tests ciblés : 13/13 réussis ; les cinq générateurs sont vérifiés avec et sans
activation, ainsi que le budget de prompt, les tokens et l’injection idempotente.
- Suite Vitest complète et build de production standard : commande chaînée,
code de sortie 0.
- Playwright : 202/202 en quatre shards (51 + 51 + 50 + 50). Le shard 3 a dû
être relancé avec une limite de 8 Gio après la disparition du serveur de
développement sous 6 Gio ; aucun fichier de production n’a été touché.
- Le test isolé de catalogue en cause a aussi passé 1/1.

Les fichiers du checkout de validation ont été comparés aux blobs du commit
poussé avant d’attribuer ces résultats à ce SHA. Le deuxième worktree détaché
créé pour essayer le mode de validation précompilé n’avait pas les dépendances
des packages internes montées correctement ; son échec n’est pas un échec du
code. Le build standard et les quatre shards Playwright ont ensuite abouti.

## Limites qui restent ouvertes

- Aucun fournisseur IA ni quota n’a été utilisé. Les cinq chemins sont exercés
  avec un modèle factice, pas avec des générations réelles.
- Le prompt demande l’emploi exclusif des tokens, mais une réponse IA qui
  l’ignore et contient des couleurs codées en dur n’est pas encore rejetée ou
  réparée par un linter déterministe HTML.
- Aucune capture navigateur n’a été produite pour mesurer la lisibilité
  statique d’une simulation et d’un diagramme réels avec charte.
- Les polices sont limitées aux polices déjà présentes sur l’appareil, suivies
  de familles système ; aucune disponibilité identique sur chaque OS n’est
  garantie.
- L’étude de l’habillage natif des quiz/PBL n’est pas incluse dans ce commit.

WP6 dispose donc du câblage et des gates automatisées, mais son acceptation
visuelle et l’absence effective de couleurs littérales dans des sorties réelles
restent à prouver au WP10. Aucun déploiement n’a été fait.
