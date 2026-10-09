# WP7 — Matrice de fidélité des exports

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Base de code examinée : commit `5b295397`  
Périmètre : lecteur, export PPTX, MP4, SCORM 1.2/2004 et cmi5.

## Conclusion

Le lecteur est la référence visuelle. Le MP4 et le SCORM peuvent reprendre ses
pixels quand une capture navigateur est bien produite et persistée. Sans capture,
ils basculent sur une carte générique qui ne représente pas fidèlement la slide.
Le PPTX est reconstruit en éléments PowerPoint natifs : il reste éditable, mais
ce chemin n'est pas pixel-identique et plusieurs propriétés sont traduites ou
réduites.

La limite la plus nette est le dégradé : le PPTX mélange seulement le premier et
le dernier arrêt en une couleur unie, sans préserver la direction ni les arrêts
intermédiaires. Les polices ne sont pas incorporées. Par conséquent, un design
qui dépend de la transition du dégradé ou d'une police précise ne peut pas être
promis identique dans les quatre rendus.

## Matrice de support

« Fidèle » signifie que le chemin de rendu transporte la propriété sans la
réduire. Pour MP4 et SCORM, cette qualification dépend de la présence de la
capture de la slide. Elle ne signifie pas que quatre moteurs distincts ont été
comparés pixel par pixel. « Dégradé » indique une traduction ou un fallback
visuel différent. « Non supporté » signifie que le chemin ne produit pas cette
propriété.

| Propriété | Lecteur Qalem | PPTX | MP4 | SCORM |
|---|---|---|---|---|
| Coins arrondis | Fidèle, selon la géométrie de la forme | Dégradé : chemins vectoriels personnalisés préservés en géométrie, mais aucune recette visuelle PowerPoint n'a certifié le rayon ; les images ne sont pas masquées par un rayon exporté | Fidèle avec capture ; dégradé vers la carte générique sans capture | Fidèle avec capture persistée ; dégradé vers la carte générique sans capture |
| Opacité | Fidèle pour les formes et éléments auxquels le renderer l'applique | Dégradé : prise en charge explicite des formes et textes, mais couverture variable des images, motifs et objets composites | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Contours | Fidèle pour les éléments qui exposent un contour | Dégradé : couleur, transparence, épaisseur et style convertis en propriétés PowerPoint | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Ombres | Fidèle dans le lecteur | Dégradé : conversion des décalages en angle/distance et propriétés de flou PowerPoint ; rendu dépendant du moteur de présentation | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Filet / trait fin | Fidèle à l'échelle du lecteur | Dégradé : conversion des pixels en points, sans seuil de lisibilité garanti après réduction | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Dégradé de fond | Fidèle : dégradés linéaires/radiaux et arrêts CSS | Dégradé : couleur unie calculée en mélangeant le premier et le dernier arrêt ; direction et arrêts intermédiaires perdus | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Graphique | Fidèle au rendu du composant de graphique | Dégradé : graphique natif éditable, mais axes, légende et palette sont reconstruits par le moteur PowerPoint | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Tableau | Fidèle au rendu du composant de tableau | Dégradé : tableau natif éditable, thèmes et styles reconstruits dans la table PowerPoint | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Espacement des lettres | Fidèle lorsque `wordSpace` est renseigné | Dégradé : conversion vers `charSpacing`; les métriques dépendent aussi de la police substituée | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |
| Interligne | Fidèle lorsque `lineHeight` est renseigné | Dégradé : conversion vers `lineSpacingMultiple` et `autoFit: true`; le résultat dépend de la police et de PowerPoint | Fidèle avec capture ; dégradé sans capture | Fidèle avec capture persistée ; dégradé sans capture |

### Condition des captures MP4 et SCORM

- MP4 : le navigateur capture les scènes de type slide avec `slideToPng` à
  1 920 px, puis les envoie au serveur. En cas d'échec, une alerte visible est
  affichée et la génération remplace la slide par `buildSceneCardSvg`.
- SCORM/cmi5 : le paquet réutilise les captures persistées dans le stockage.
  Si une capture manque, la même carte générique est générée. Les widgets sont
  en outre présentés comme des captures statiques, non comme des contrôles
  interactifs exécutables dans le paquet.
- La carte de secours utilise ses propres couleurs et la police Arial. Elle ne
  consomme pas la charte de la présentation : son usage est donc un changement
  de design visible, pas un export fidèle.
- Aucune animation porteuse de sens n'est exportée. Le MP4 compose des images
  statiques avec l'audio disponible ; SCORM/cmi5 embarquent les captures.

## Contrat de thème commun proposé, sans implémentation dans WP7

Créer un instantané immuable et versionné, calculé une fois par formation :

```ts
type PresentationRenderTheme = {
  version: 1;
  snapshotId: string;
  tokens: DesignTokens;
  typography: {
    heading: string;
    body: string;
    fallback: string[];
  };
  unsupported: Array<'gradient-direction' | 'image-radius' | 'animation'>;
};
```

Le lecteur, le générateur PPTX et la capture destinée au MP4/SCORM doivent
consommer le même instantané enregistré avec la formation, jamais relire la
charte courante du tenant au moment d'un export ancien. Chaque adaptateur doit
déclarer explicitement ses pertes ; une perte nécessaire à la compréhension ou
au contraste doit provoquer un avertissement, pas un rendu silencieusement
différent.

## Politique de polices proposée, sans implémentation dans WP7

- Le PPTX référence la famille choisie, mais le code ne l'incorpore pas. Une
  police absente est remplacée par l'environnement du destinataire ; le retour
  à la ligne, la hauteur et l'autofit peuvent changer.
- Le lecteur utilise les polices accessibles au navigateur. MP4 et SCORM avec
  capture figent les pixels vus par ce navigateur ; la carte de secours retombe
  sur Arial.
- Pour l'édition PPTX, préférer une liste courte de polices de bureau largement
  disponibles, approuvées dans le catalogue de polices de WP2. N'incorporer une
  police qu'après vérification de sa licence et validation de la compatibilité
  PowerPoint ; aucune incorporation n'est attestée aujourd'hui.
- L'export doit afficher une préalerte si une police non sûre pour PPTX est
  demandée, avec le nom de la substitution retenue. Il ne faut pas promettre
  une apparence identique quand les polices ne sont pas installées.

## Traitement de l'autofit proposé, sans implémentation dans WP7

Le lecteur conserve sa boîte fixe, tandis que le PPTX active actuellement
`autoFit`. Cette divergence est incompatible avec une promesse de taille
typographique constante. Garder l'espace de sécurité de 15 à 20 % demandé au
§3.9, mesurer avec la famille réellement résolue et composer à une taille qui
tient dans les deux rendus. L'autofit PPTX ne doit être qu'une protection contre
les écarts résiduels de métriques ; toute réduction automatique doit être
signalée et ne jamais rétrécir sous les planchers typographiques du design
system.

## Texte de remplacement à répercuter dans les §3.7 et 3.8

Le brief source étant un fichier de référence fourni en lecture seule, il n'a
pas été modifié. Cette formulation est le correctif rédactionnel prêt à y
répercuter :

### §3.7 — Cartes, liserés, formes

- Conserver l'inversion des surfaces comme source principale de profondeur ;
  les ombres ne portent jamais de sens.
- Les liserés sont des formes fines séparées, car le DSL ne fournit pas de
  bordure latérale native. Vérifier leur contraste et leur lisibilité à la
  taille d'affichage cible.
- Les rayons simples restent autorisés dans le lecteur et les captures MP4 /
  SCORM. Dans le PPTX, ne pas compter sur un masque arrondi pour les images ;
  les formes vectorielles préservent leur chemin, mais leur rayon n'a pas été
  certifié par comparaison visuelle sur PowerPoint. Le rayon ne doit donc pas
  porter une distinction fonctionnelle.

### §3.8 — Dégradés, ombres, animations

- Les dégradés sont fidèles dans le lecteur et dans une capture MP4/SCORM
  réussie. Le PPTX les réduit à un aplat obtenu par mélange du premier et du
  dernier arrêt, sans conserver la direction ni les arrêts intermédiaires.
  Préférer un aplat pour toute information de marque, de contraste ou de
  hiérarchie ; n'utiliser un dégradé que si cet aplat de remplacement reste
  acceptable et lisible.
- Aucun dégradé sur les formes si le PPTX est un livrable attendu : l'export
  des formes applique également un mélange des arrêts en couleur unie.
- Les ombres sont décoratives uniquement ; leur rendu PowerPoint est une
  approximation et dépend de l'application. Elles ne remplacent ni contraste
  de surface, ni contour.
- Aucune animation ne porte le sens : le PPTX n'exporte pas d'animation et les
  exports MP4/SCORM reposent sur des captures statiques.

## Preuves et limites de validation

Preuves de code consultées au commit `5b295397` :

- lecteur : `useSlideBackgroundStyle`, les renderers de forme/texte, graphique
  et tableau, ainsi que `slideToPng` ;
- PPTX : `lib/export/use-export-pptx.ts` (mapping des arrêts de dégradé,
  transparence, chemins de formes, contours, ombres, graphiques, tableaux,
  `charSpacing`, `lineSpacingMultiple`, `autoFit` et polices) ;
- MP4 : `lib/export/use-export-mp4.ts`,
  `lib/export/mp4/build-classroom-video.ts` et `scene-card.ts` ;
- SCORM/cmi5 : `lib/export/scorm/build-scorm-package.ts`.

Tests exécutés sur ServeurIA, dans le conteneur de validation, sur les fichiers
dont les empreintes SHA-1 correspondent au checkout `5b295397` :

- PPTX, fond et géométrie : `background.test.ts` 2/2 et `geometry.test.ts`
  1/1 ;
- SCORM : `scorm-build-package.test.ts` 11/11 ;
- secours MP4 : `mp4-scene-card.test.ts` 3/3 ;
- total ciblé : 17/17.

Ces tests attestent la sérialisation et les branches de secours, pas une
comparaison visuelle pixel par pixel. PowerPoint de bureau avec et sans les
polices de la charte n'a pas été exercé. Le lecteur, le MP4 complet et le paquet
SCORM n'ont pas été rendus côte à côte depuis une fixture WP7 commune. Cette
recette visuelle reste nécessaire avant toute revendication de fidélité
inter-applications ; aucune police ni animation ne doit être présentée comme
garantie sur cette seule base.
