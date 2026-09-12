# PRD3 — Corrections et arbitrages du 12 septembre 2026

État : **propositions en attente d’Amine**, aucun retrait ni report décidé.
Périmètre de preuve : PRD, décisions, code et rapports versionnés lus sur le socle
`99631c44cc6a7b7475f465fb51307534e74da149` et le diff documentaire courant.
Les preuves de production datées ne sont pas présentées comme un nouveau contrôle du service.

## 1. Corrections documentaires effectuées sans changer le périmètre

- Dix US portaient `to_validate` avec `passes=true` : S6-004, S6-013, S-025,
  S6-010, S1-007, S1-008, S1-010, S1-004, S1-005, S2-009. Elles sont maintenant
  `passes=false`, avec leurs preuves historiques intégralement conservées.
  Ce n’est ni dix fonctionnalités perdues, ni dix fonctionnalités à recoder.
- S6-014 n’attend plus une autorisation : celle du 9 septembre existe. Statut
  `to_implement`, rotation non effectuée par cette correction documentaire.
- S-037 est `to_validate`, pas bloquée par l’ancienne décision : le gap décrit
  du code raccordé et des recettes/publication restant à faire.
- S-019/020/021 demandent maintenant NotebookLM/Notion/Drive **via Diwan** dans
  leurs titres, critères et dépendances, conformément à la décision existante.
  Les anciennes prescriptions MCP direct ont été remplacées ; les capacités de
  recherche, lecture, droits et génération référencée sont conservées.
- S6-004 ne dépend plus de Diwan pour sa bibliothèque de fichiers locaux.
  Les sources Diwan restent sous S6-003 et les US fournisseur.
- S1-007 demande le runtime SCO natif acté par ADR-106, pas `scorm-again`
  simultanément exigé et déclaré remplacé dans l’ancien registre.
- S-036/S-047 parlent de pseudonymisation, sans prétendre que le hachage rend
  les données anonymes. S-037 décrit un ajustement observable, pas un
  ordonnancement « optimal » garanti par quelques observations.
- S3-011 à S3-014 couvrent les compléments mobiles demandés, sans second
  générateur, second moteur FSRS ou seconde bibliothèque. La recette du
  transport physique reste S3-002 ; la recette intégrée est S3-014.
- S3-005 est rouverte : le générateur accepte plus de douze graines, la route
  transmet le stock entier, mais le calendrier dépasse J+90 dès la treizième.
  L’appel est placé avant le bloc de traitement des erreurs de création.
  Constat statique croisé avec le test limité à douze graines ; reproduction
  ServeurIA encore requise, aucun incident de production inventé.
- Les préférences mobiles ne sont pas suspendues à l’appairage WhatsApp ;
  la livraison de ce canal reste néanmoins exigée dans S6-011 tant qu’Amine le conserve.

Sources croisées : [décision du 9 septembre](2026-09-09-unblock-prd.md),
[preuve SCORM](../validation/S1-007-scorm12-moodle-browser.md),
guides [NotebookLM](../guides/notebooklm-via-diwan.md),
[Notion](../guides/notion-via-diwan.md), [Drive](../guides/google-drive-via-diwan.md),
`lib/anchoring/seed-stock.ts`, `lib/anchoring/schedule.ts`,
`app/api/live-sessions/[id]/seeds/route.ts`,
`app/api/notification-preferences/route.ts`,
`app/api/live-sessions/[id]/anchor-plan/route.ts`,
`tests/anchoring/schedule.test.ts`.

## 2. Ce qui mérite réellement une décision produit

Les recommandations suivantes sont des arbitrages de périmètre, pas des faits
de marché ni une validation d’intérêt client. Aucun entretien ou chiffre de
conversion n’a été inventé pour les justifier.

| N° | US / sujet | Incohérence ou inadéquation à trancher | Recommandation | Contrepartie |
|---|---|---|---|---|
| A1 | S6-003, S-019/020/021 — Diwan et trois fournisseurs | Le multisource local est distinct des connecteurs. Exiger les trois fournisseurs avant toute clôture dépend d’un contrat et d’accès externes encore non prouvés. | Garder le multisource comme cœur. Garder les connecteurs en modules séparés ; décider si chacun doit bloquer la première livraison commercialisable. Ne pas créer de connecteur direct parallèle. | Les différer réduit la portée d’intégration annoncée ; les garder tous obligatoires maintient la dépendance externe. Sans décision, les trois restent requis. |
| A2 | S1-007/008 — SCORM 1.2/2004/cmi5 | L’export est statique avec audio et suivi LMS, pas une classroom multi-agent interactive embarquée. Le classement cœur/option reste explicitement réservé dans S1-008. | Garder les exports existants en option institutionnelle, en présentant honnêtement leur périmètre. Ne pas supprimer du code déjà livré uniquement pour alléger une liste. | L’option apporte une capacité d’intégration, mais nécessite maintien des trois formats et recettes LMS ; la classroom native ne voyage pas avec l’export. |
| A3 | S-035, S3-010, U-018 — xAPI/LRS | La recette de réception et d’effacement dépend d’un vrai LRS destinataire ; le gap S-035 du 10 septembre ne rapporte aucun LRS configuré. Les analyses internes n’en dépendent pas. | Garder xAPI comme intégration institutionnelle activable par tenant, distincte du fonctionnement des rapports internes. Décider si un LRS réel est exigé avant la première livraison ou dans une livraison dédiée. | Le différer empêche de déclarer l’intégration xAPI livrée ; le garder obligatoire nécessite un destinataire et sa politique d’effacement. |
| A4 | S6-011 et S3-013 — WhatsApp | Le rappel de révision WhatsApp est conservé mais sa réception réelle reste ouverte ; ANCRER est aujourd’hui cadré Web Push. « Notifications » ne signifie donc pas automatiquement flashbacks sur tous les canaux. | Push pour l’ancrage personnalisé, e-mail en complément ; WhatsApp comme canal facultatif par tenant. Trancher maintien immédiat de WhatsApp et éventuelle extension aux flashbacks. | Le retirer réduit les canaux disponibles ; le conserver exige appairage, consentement du canal, désinscription et recette réelle. Ne pas confondre facultatif pour le tenant et facultatif pour notre livraison. |
| A5 | S1-012 — capture du cours F6G9W_LPT8 | La clôture est attachée à une capture précise de proxy.ai-mpower.com et à son authentification, alors que les visuels originaux restent exigés ailleurs. Une démonstration de logiciel et une illustration originale sont deux usages différents. | Garder la capture web contrôlée pour une démonstration explicitement demandée ; remplacer cette vieille cible de recette par une cible encore utile et approuvée. | Changer la cible exige ton accord et une nouvelle preuve ; conserver le critère exact nécessite son accès et la validation visuelle de ce cours. |
| A6 | S2-008/009 — AudioSeal et « indélébile » | La preuve visuelle montre un identifiant lisible sur une capture ; elle ne prouve pas une impossibilité de retrait. AudioSeal conserve un déploiement et une recette à finir. | Garder la traçabilité des exports/transmissions avec limites de robustesse explicites. Remplacer la promesse « indélébile » par une promesse testable ; décider si AudioSeal conditionne la première livraison. | Un filigrane n’empêche pas toute copie ; différer AudioSeal laisse ce canal de traçabilité non livré. Le conserver exige la chaîne de traitement et son exploitation. |
| A7 | S3-004/005/007/008 et S3-011/013 — vingt graines, cadence, J+90 | Vingt graines sont l’échantillon humain ; le calendrier inspecté accepte douze graines avant J+90. L’ancien texte dit J+10–90, le rythme documenté commence J+2 ; le nouveau besoin exige adaptation et contrôle. | Garder vingt graines pour juger le ton, douze comme cadence initiale modifiable, J+90 comme plafond initial et J+30/J+60 pour les évaluations ; ne pas confondre stock, sélection et nombre de push. Trancher si le plafond doit devenir configurable. | Une adaptation complète exige arbitrage inter-formations et replanification. Lever J+90 implique de changer contraintes SQL et politique de conservation, pas seulement un paramètre UI. |

## 3. Points déjà tranchés à ne pas rouvrir inutilement

- Andragogie d’abord ; FR, arabe standard dans l’interface, EN et RTL conservés.
- Optimiseur et Director conservés sans minimum caché d’observations ; mesurer
  l’utilité et l’application au-delà des clics fait déjà partie de l’objectif.
  Un score post-discussion ne devient pas automatiquement une preuve de gain.
- PWA retenue pour mobile ; aucun mandat implicite pour publication native dans les stores.
- Prix à la valeur : prix vendu indépendant du coût ; 95 % est une cible
  de marge mesurée, pas une garantie ou une formule de prix.
- Consentement explicite avec refus/retrait selon la décision du 9 septembre ;
  ne pas ressusciter le cadrage antérieur « implicite dans les CGU ».
- Rotation Qalem autorisée ; aucun droit d’action dans les autres projets.
- Whisper réel, deux tenants, isolation, reprise, sécurité et recette mobile
  restent des engagements : les retirer pour obtenir un indicateur vert changerait le produit.

## 4. Règle de décision

Amine peut conserver un engagement obligatoire, le conserver comme option
effectivement livrée, décider d’une livraison ultérieure, ou le retirer.
Une option commerciale n’est pas une dispense de réalisation.
Un report accepté conserve sa trace et ne devient jamais `passes=true`.
Tant qu’aucune décision n’est consignée, tous les engagements présents restent
dans l’objectif actif ; ces recommandations ne réduisent pas sa portée.
