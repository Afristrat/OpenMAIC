# U-015 — Administration MCP

## État au 7 septembre 2026

Code fonctionnel `b6f42a5`, format et harnais corrigés dans `474ceb5` puis complément de format uniquement. Les exemples statiques et la temporisation simulée disparaissent. Le composant consulte l’API privée existante avec no-store et annulation au démontage, valide sa réponse et ne rend que les métadonnées publiques. Un clic redemande une sonde réelle ; chargement, refus 401/403, échec/invalide et registre vide ne sont pas confondus. Aucune URL ni clé n’est transmise par la route. Le texte annonce le périmètre du processus web et la configuration sécurisée côté serveur.

## Validation ciblée

ServeurIA, `qalem-refork-exec`, clone `/workspace/.codex-gate-s3-008-fe6ebba` :

- `pnpm exec tsc --noEmit` : succès sur le code fonctionnel.
- `pnpm exec vitest run tests/mcp/admin-health.test.ts` : 2/2. Refus avant initialisation et route réservée au super-administrateur, absence de diagnostics distants.
- `pnpm exec eslint --no-ignore --max-warnings 0 components/admin/mcp-tab.tsx e2e/tests/admin-mcp.spec.ts` : succès. Le ciblage initial sans `--no-ignore` ignorait les E2E et émettait un avertissement ; ce passage ne constitue pas la preuve retenue.
- `E2E_PORT=3018 pnpm exec playwright test e2e/tests/admin-mcp.spec.ts --retries=0` : 4/4 en 8,8 secondes, session 44084 terminée avec code 0. FR/AR/EN, RTL arabe, métadonnées reçues, changement connecté→erreur au clic, vide, 403 et réponse invalide. Les réponses MCP sont interceptées ici ; le protocole réel relève des preuves S-018.

Le premier harnais faisait varier la réponse sur le nombre de requêtes, ce qui assimilait à tort le double montage React de développement à un second test utilisateur. La version corrigée change la réponse explicitement au clic et vérifie une nouvelle requête. Aucun contournement produit ajouté.

## Restes avant clôture

Le gate corrigé s’est terminé avec code 0, 2 714 Vitest et 116 Playwright, mais le journal comportait des sondes de capacité vers la base fictive et une erreur classroom. La fixture commune `bc56211` intercepte explicitement les capacités inactives, sans masquer les journaux. Le ciblage MCP+éditeur répété deux fois passe 10/10 ; la fuite classroom n’y est pas reproduite. Une suite navigateur complète sur le même build est en cours (`38221`, `/tmp/qalem-u015-browser-boundary.log`). La publication demeure en attente ; ce constat n’est pas une garantie de disparition de la fuite intermittente.

Le gate `8ff48aa` a échoué sur le plafond V8 de TypeScript à environ 2 Gio, avant Vitest : SIGABRT, sans arrêt ni OOMKilled du conteneur de validation ou des conteneurs de production. La commande persistante `pnpm typecheck` utilise maintenant 4 Gio, et les références CI/PRD/AGENTS ont été mises à jour. Le SHA corrigé `a6420b992d8a8f1871d358a524b003a5233c8fb0` a passé format, TypeScript et ESLint global ; la suite continue sous le handle `2504`, journal `/tmp/qalem-u015-full-corrected.log`. Cette correction ne garantit pas l’absence de fuite mémoire en exploitation.

Gate global au SHA final, déploiement et recette authentifiée de l’onglet en production. Le serveur Next de développement signale un workspace parent ignoré ; ce run ciblé n’est pas présenté comme un gate global sans avertissement. Aucune activation documentaire ni garantie mémoire sous charge. `passes=false` maintenu.
