# WP8 — Écarts de rendu arabe et RTL

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Base examinée : `1b425c9b`  
Périmètre : direction des slides, polices, scripts mixtes, lecteur, PPTX, MP4,
SCORM et cmi5. Aucun code produit n'est modifié par WP8.

## Conclusion

Qalem sait localiser son interface en arabe marocain, mais cela ne constitue
pas une garantie de mise en page RTL des slides. La direction globale HTML suit
la langue de l'interface, pas celle de la formation ; le DSL des slides n'a pas
de champ direction ; l'export PPTX n'active pas les options RTL disponibles
dans la dépendance. Le paquet SCORM écrit bien `lang="ar"` et `dir="rtl"` à
partir de la langue du cours, mais cela ne corrige ni les captures de slides
prises en amont ni la carte de secours, et ne prouve pas le mélange correct de
scripts ou la lecture accessible.

**Décision de sécurité provisoire :** ne pas annoncer le rendu RTL fiable des
présentations. L'interface arabe peut rester disponible ; les formations dont
la langue est `ar-MA` doivent être identifiées comme non certifiées pour leur
mise en page de slide jusqu'à validation des parcours ci-dessous.

Le test existant `tests/export/scorm-build-package.test.ts` vérifie bien
`lang="ar"` et `dir="rtl"` pour `ar-MA` dans le paquet LMS. Il certifie les
attributs du document SCORM, pas le rendu des pixels de la slide ni la
composition PPTX. La suite ciblée WP7 l'a exécuté avec succès (11/11).

## Matrice d'écarts

| Élément | Preuve actuelle | Écart / risque | Suite requise |
|---|---|---|---|
| Police arabe du lecteur | `packages/@openmaic/renderer/fonts.css` et `fonts.config.mjs` ne listent que six familles CJK ; elles sont chargées depuis `https://file.maic.chat/fonts/`. Le CSS de Qalem ne déclare pas de fonte arabe dédiée. | Le navigateur peut substituer une fonte de l'appareil ; métriques, formes de lettres, ligatures et retours à la ligne ne sont pas déterministes. La fonte CJK référencée dépend en outre d'un domaine extérieur à Qalem. | Évaluer une fonte arabe et l'héberger sur l'origine Qalem, avec son fichier de licence et des tests de couverture/glyphes. Candidat initial, non choisi : Noto Sans Arabic, sous SIL OFL 1.1 ; valider les métriques et le rendu avant sélection. Le projet Noto Arabic indique la licence OFL et ses conditions permettent l'intégration avec conservation des mentions/licence ([projet](https://github.com/notofonts/arabic), [texte OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/OFL.txt)). |
| Direction dans le DSL | `PPTTextElement`, `ShapeText`, `Slide` ne portent pas de direction de lecture. Le DSL expose la géométrie, le texte, son alignement, sa famille de caractères et son type, mais pas de `dir` / `direction` sémantique au niveau slide ou segment. | Le contenu de la formation ne peut pas imposer sa direction de façon persistée et indépendante de la locale de l'interface. | Ajouter au contrat de slide une direction héritée (`ltr` / `rtl` / `auto`) et permettre une exception locale sur un segment de script mixte, si nécessaire. Définir la valeur à partir de la langue persistée du cours, pas de la langue de l'interface. |
| Lecteur et éditeur | `HtmlDirectionManager` met `dir` et `lang` sur `<html>` selon la locale de l'interface. Aucun renderer d'élément de slide n'applique sa propre direction à partir de la langue du cours. | Une formation arabe ouverte avec une interface française dépend du défaut LTR ; une interface arabe peut influer sur une formation française. Les cartes sont positionnées par coordonnées absolues et ne sont pas automatiquement miroir. | Appliquer la direction du cours à la racine de la slide. Distinguer ordre de lecture, alignement du paragraphe et position graphique ; ne pas retourner arbitrairement toute composition. Ajouter une vue RTL à l'éditeur et des cas de test de débordement. |
| Texte mixte arabe / français / anglais | Le renderer affiche le HTML de l'élément ; aucune règle dédiée `dir`, `lang` ou isolation bidi n'a été trouvée au niveau des portions de texte. | Nombres, acronymes, URL, parenthèses, unités et ponctuation peuvent se déplacer ou être associés au mauvais segment. Le texte arabe peut avoir des glyphes présents tout en ayant un ordre visuel erroné. | Définir les règles d'isolation des segments LTR et RTL ; tester en particulier « رقم 12 — Plan-do-check-act (PDCA) », montants, dates, parenthèses et deux-points. Ne pas inverser manuellement les chaînes. |
| Chiffres et ponctuation | Pas de préférence explicite chiffres arabes-indicatifs (`٠١٢`) ou chiffres latins (`012`) dans le DSL ou l'export. | Mélange involontaire des conventions et comportement bidi variable selon le navigateur, le moteur Office et les réglages du destinataire. | Faire porter le choix de chiffres par la locale ou une préférence éditoriale explicite. Dans l'attente, préserver les caractères fournis et ne pas convertir silencieusement. |
| Alignement, cartes et ordre de lecture | Les positions de slide sont des coordonnées LTR ; le tableau `elements` est l'ordre d'ajout. Le contrôle de direction global de l'application ne transforme pas les coordonnées ni l'ordre des éléments. | Visuel et ordre de lecture peuvent diverger ; le miroir automatique peut lui-même inverser une chronologie, un graphique ou une séquence métier. | Ajouter un ordre de lecture distinct des coordonnées visuelles. Définir les patterns RTL fonction par fonction : comparaison, séquence, tableau, graphique, carte et alignement du titre. |
| PPTX | Le fork `packages/pptxgenjs` expose `rtlMode` au niveau présentation et texte. `lib/export/use-export-pptx.ts` n'active pas `pptx.rtlMode` et ne transmet pas `rtlMode` aux options des textes. Le défaut d'export est `Microsoft YaHei`, famille CJK. | Le document peut garder un paragraphe LTR et une fonte de substitution inadaptée ; la simple présence de caractères arabes ne certifie ni l'ordre ni l'alignement. | Propager la direction de la slide et du paragraphe dans le XML, choisir une famille réellement testée, garder les segments latins isolés et vérifier dans PowerPoint/LibreOffice. |
| MP4 | L'export capture le canvas du navigateur. La capture hérite donc du problème de direction dépendant de la locale de l'interface. Le fallback `buildSceneCardSvg` n'a ni direction arabe ni fonte arabe déclarée. | Le MP4 peut être fidèle à une capture déjà incorrecte ; si la capture échoue, sa carte de secours n'est pas une représentation RTL fiable. | N'accepter la capture que si la slide a été rendue avec la direction persistée du cours ; faire échouer la certification de la capture sinon. Rendre le fallback bilingue/RTL, ou signaler explicitement son absence. |
| SCORM / cmi5 | `build-scorm-package.ts` fixe le `lang` et `dir` de l'HTML à partir de `stage.language`. Les slides sont des PNG persistés ou une carte générique SVG. Les widgets sont affichés comme captures statiques. | Le conteneur HTML RTL est une bonne base, mais les PNG pré-rendus ne sont pas réparés par `dir=rtl`; les cartes SVG de secours ne gèrent pas l'arabe. L'interactivité est statique. | Garantir que chaque PNG est capturé après rendu conforme au cours ; corriger et tester aussi la carte SVG de secours, les transcriptions, la navigation clavier et le suivi LMS. |
| Accessibilité / ordre de lecture | Le navigateur applique le bidi Unicode, mais les éléments de slide restent des éléments positionnés. Le PPTX est assemblé dans l'ordre du tableau d'éléments. Aucun ordre de lecture RTL dédié n'est défini. | Le visuel peut sembler plausible sans être parcourable correctement par lecteur d'écran ni être structuré dans le PPTX. | Tester au clavier et avec au moins un lecteur d'écran ; émettre les éléments PPTX dans l'ordre sémantique et conserver un contraste indépendant de la direction. |

## Architecture recommandée

1. Persister `language` et `direction` dans le modèle de formation ; dériver
   `rtl` de la direction sémantique, et non de la locale de l'interface.
2. Propager un contrat de rendu versionné jusqu'au lecteur, à l'éditeur, au
   PPTX et à la capture MP4/SCORM. Prévoir `auto` seulement pour les segments
   mixtes, jamais comme substitut à une direction de slide connue.
3. Garder les coordonnées des compositions auteur. Un moteur de composition
   RTL déplace les rôles sémantiques selon un pattern validé ; il ne fait pas
   un miroir aveugle de toutes les coordonnées.
4. Fournir une fonte arabe auto-hébergée avec licence et attribution conservées.
   Noto Sans Arabic est un candidat technique initial, pas une décision
   typographique ; l'OFL autorise l'intégration sous ses conditions. Sa forme,
   ses métriques, la couverture des signes diacritiques et les scripts mixtes
   doivent être testés dans Qalem avant toute sélection.
5. Dans le PPTX, transmettre explicitement le mode RTL au document et aux
   paragraphes, puis fixer une fonte de repli vérifiée. Ne pas supposer que le
   navigateur et PowerPoint composent les segments mixtes de la même façon.
6. Créer une fixture unique contenant arabe, français, anglais, chiffres,
   ponctuation, carte, chronologie, tableau, graphique et texte débordant ; la
   capturer sous interface FR et AR puis comparer lecteur, PPTX, MP4 et SCORM.

## Estimation d'effort

Estimation technique à partir des surfaces concernées, non mesurée en
implémentation : **6 à 9 jours d'ingénierie**, hors arbitrage typographique et
hors attente d'une recette utilisateur. L'incertitude la plus forte est le
PPTX de scripts mixtes et la validation de l'ordre de lecture, pas l'ajout du
champ DSL.

| Lot | Estimation | Résultat attendu |
|---|---:|---|
| Contrat DSL et propagation de langue/direction | 1 à 1,5 j | Valeur persistée, rétrocompatibilité LTR et sérialisation |
| Police, chargement auto-hébergé et fallback | 0,5 à 1 j | Fonte approuvée, licence et glyphes contrôlés |
| Lecteur, éditeur et patterns RTL | 1,5 à 2 j | Direction par cours, cartes, texte et graphiques testés |
| PPTX, texte mixte et fonte | 1 à 2 j | XML RTL, test d'export et comparaison Office/LibreOffice |
| Captures MP4, secours SVG, SCORM/cmi5 | 1 à 1,5 j | PNG cohérents, fallback et shell LMS correctement orientés |
| Fixtures visuelles, clavier, lecteur d'écran et correction | 1 à 2 j | Validation de bout en bout, documentation des limites |

## Décisions nécessaires avant toute implémentation RTL

- Choisir le registre écrit des formations arabes : arabe standard moderne,
  darija marocaine, ou les deux avec une valeur explicite par formation.
- Choisir la fonte de la charte arabe après aperçu ; Noto Sans Arabic est la
  proposition de départ, pas un choix figé.
- Choisir la politique de chiffres : forme fournie par l'auteur, ou défaut par
  locale avec possibilité de remplacement par formation.
- Valider qu'un comportement d'attente (avertissement/non-certification) est
  acceptable pour les exports d'une formation arabe jusqu'à la recette de
  bout en bout.

## État de l'intermédiaire demandé par le brief

Le brief WP8 demande de journaliser quand une formation arabe n'a pas de rendu
RTL certifié. L'examen du code ne trouve pas de journal d'écart dédié à ce cas.
WP9 devra ajouter un événement mesurable, par exemple
`presentation_rtl_unverified`, sans contenu de formation ni donnée personnelle.
Ce rapport n'active aucune modification de comportement et ne consomme aucun
quota de génération.
