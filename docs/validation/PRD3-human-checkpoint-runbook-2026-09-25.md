# Recette humaine consolidée du PRD 3

- Date de préparation : 25 septembre 2026
- Production à recevoir : `https://qalem.ma`
- SHA fonctionnel déployé : `3c2dedf0be6fc5a4f53b80b6a5d99388c7f906fa`
- Tenant de démonstration : Human Yo Impact, `aa7870b7-3938-4f24-b8bf-4a9d73565ba7`

## Objet

Cette recette regroupe les treize stories dont la dette machine est soldée mais dont la clôture exige une perception humaine, un destinataire réel ou un appareil physique. Elle ne remplace aucun verdict humain par un test automatisé. Les quatre dépendances Diwan ne font pas partie de cette recette.

## Matériel et preuves à préparer

- un ordinateur avec microphone et navigateur à jour ;
- un iPhone ou iPad sous Safari 16.4 ou ultérieur ;
- un appareil Android avec Chrome à jour ;
- une adresse e-mail qui n’a encore jamais consommé d’invitation Qalem ;
- le téléphone WhatsApp retenu pour l’instance `qalem-reminders` ;
- pour chaque appareil : modèle, système, version du navigateur et heure du test ;
- une capture uniquement en cas de défaut, avec l’URL et le message visibles ; ne jamais capturer un QR, un jeton, un mot de passe ni une notification privée.

## Préparation prise en charge par l’agent

Immédiatement avant la session, l’agent doit vérifier le SHA de production, préparer une carte de révision arrivée à échéance et les données de formation nécessaires, puis envoyer l’invitation nominative au moment convenu. Aucun accès à la base, aucun déclenchement de worker et aucune manipulation de jeton ne sont demandés à Amine. Après la recette, l’agent nettoie les fixtures et consigne les verdicts.

## Bloc A — Réception de bureau

Point de départ : [Qalem pour Human Yo Impact](https://qalem.ma/app?orgId=aa7870b7-3938-4f24-b8bf-4a9d73565ba7).

### A1 — S3-008 : ton et pression des graines

Lire la [fiche de réception des vingt graines P3-B-v11](../evidence/s3-008-human-review-v11.md), puis rendre deux verdicts distincts :

- ton andragogique : accepté ou refusé, avec les numéros à corriger ;
- cadence : acceptée ou refusée pour J+2, J+5, J+9, J+14, J+20, J+27, J+35, J+44, J+54, J+65, J+77 et J+90, plus les évaluations J+30 et J+60.

Succès : un verdict explicite sur les deux dimensions. Le drapeau `anchoring` ne doit pas être activé avant ce verdict.

### A2 — S6-012 : lecture des voix

Dans les deux sélecteurs de voix de l’accueil authentifié :

1. écouter au moins une voix française et une voix anglaise ;
2. changer de voix, relancer l’écoute, puis interrompre une lecture en cours ;
3. recharger la page et vérifier que la voix sélectionnée reste cohérente avec le prénom, l’avatar et la langue.

Succès : le son démarre dans les deux sélecteurs, l’annulation fonctionne et aucune identité ne change silencieusement.

### A3 — S0-017 : modèles d’image administrés

Ouvrir **Médias**, puis le choix du modèle d’image. Vérifier que les libellés sont compréhensibles et que l’identifiant technique reste discernable lorsqu’il est nécessaire de différencier deux modèles.

Succès : aucun libellé tronqué, ambigu ou illisible. Noter textuellement tout libellé refusé.

### A4 — S6-009 : microphone et ASR

1. autoriser le microphone, dicter une phrase en français, une en arabe standard et une en anglais ;
2. vérifier que chaque transcription devient visible puis est réellement réutilisable dans la demande Qalem ;
3. refuser ensuite l’autorisation du microphone et vérifier qu’aucun envoi silencieux ne se produit ;
4. couper le réseau pendant un essai, puis le rétablir, et vérifier qu’aucune réussite fictive n’est annoncée.

Succès : accepter ou refuser séparément les résultats FR, arabe standard et EN. Aucun verdict darija ni TTS ne doit être déduit de ce test.

### A5 — S0-012 : parcours arabe RTL

Basculer Qalem en arabe et exécuter la checklist [RTL ar-MA](../foundation/0-socle/checklist-rtl.md) sur l’accueil, la génération, la salle de cours, le quiz et les réglages.

Succès : verdict humain explicite ; chaque défaut observé doit indiquer l’écran, le sens attendu et le sens obtenu.

## Bloc B — Invitation nominative

Story couverte : S6-021.

1. envoyer une invitation depuis l’administration du tenant à l’adresse de recette ;
2. ouvrir l’e-mail réellement reçu et suivre son lien HTTPS ;
3. terminer la création du compte, puis vérifier l’accès à la bonne organisation ;
4. rouvrir le lien consommé et vérifier son refus ;
5. vérifier que la page [Connexion Qalem](https://qalem.ma/auth) ne propose aucune inscription publique.

Succès : réception humaine confirmée, création du seul compte invité, appartenance correcte et rejeu refusé. L’heure de réception doit être consignée ; le contenu du jeton ne doit jamais être copié.

## Bloc C — Recette physique consolidée iOS et Android

Stories couvertes : S6-010, U-020, S3-002, S3-012, S3-013 et S3-014.

Exécuter la même séquence sur iOS puis Android, avec une formation publiée de Human Yo Impact.

1. ouvrir Qalem, installer la PWA depuis le parcours proposé et vérifier l’icône ainsi que le lancement autonome ;
2. autoriser les notifications et choisir des préférences visibles, un fuseau et une plage silencieuse ;
3. commencer une formation, écouter un passage, répondre à un quiz et ouvrir une discussion ;
4. interrompre pendant une activité et pendant une vidéo, puis reprendre sur l’autre appareil ;
5. vérifier la reprise à la bonne scène, avec brouillon, transcript et position média conservés lorsqu’ils s’appliquent ;
6. fermer complètement la PWA, utiliser **Envoyer une notification test** après préparation de la carte due par l’agent, recevoir la notification et toucher celle-ci ;
7. vérifier l’ouverture de la bonne formation et de la bonne activité ;
8. observer l’écran verrouillé : aucune donnée privée, aucun nom de tiers ni contenu sensible ne doit être affiché ;
9. refuser puis réautoriser les notifications, perdre puis retrouver le réseau, et vérifier l’absence de doublon ou de rafale ;
10. se déconnecter, ouvrir une notification, se reconnecter et vérifier le retour vers la cible autorisée ;
11. terminer la formation et vérifier qu’une relance de reprise encore en attente est annulée sans supprimer un plan d’ancrage distinct accepté ;
12. recommencer le contrôle critique avec une seconde organisation et vérifier l’absence de fuite entre tenants ;
13. vérifier au moins le parcours français, le parcours arabe RTL et le retour en anglais ;
14. consigner réception, ouverture et réponse séparément : une acceptation fournisseur seule ne vaut pas réception physique.

Succès : la séquence complète passe sur les deux appareils. Tout échec doit être associé à l’étape, l’appareil, le système, le navigateur, la locale et l’heure.

## Bloc D — WhatsApp optionnel par tenant

Story couverte : S6-011.

1. appairer l’instance dédiée `qalem-reminders` avec le téléphone retenu ;
2. activer explicitement WhatsApp pour le seul tenant de recette ;
3. recevoir un rappel réel, puis vérifier sa déduplication ;
4. se désinscrire et vérifier qu’un nouvel envoi est refusé ;
5. désactiver le canal du tenant après la recette si son exploitation immédiate n’est pas souhaitée.

Succès : réception réelle, opt-in, désinscription et absence de doublon. Le QR et les identifiants ne doivent apparaître dans aucune preuve.

## Feuille de verdict unique

| Story | Verdict | Preuve humaine minimale |
|---|---|---|
| S3-008 | accepté / refusé | ton + cadence |
| S6-012 | accepté / refusé | écoute dans les deux sélecteurs |
| S0-017 | accepté / refusé | lisibilité des modèles image |
| S6-009 | accepté / refusé | microphone et verdict FR/arabe/EN |
| S0-012 | accepté / refusé | parcours arabe RTL |
| S6-021 | accepté / refusé | e-mail reçu et compte créé |
| U-020 | accepté / refusé | installation iOS + Android |
| S6-010 | accepté / refusé | cache et rappel physique |
| S3-002 | accepté / refusé | push fermé puis ouverture cible |
| S3-012 | accepté / refusé | reprise web/mobile croisée |
| S3-013 | accepté / refusé | confidentialité et pression |
| S3-014 | accepté / refusé | parcours intégré sur deux appareils |
| S6-011 | accepté / refusé | WhatsApp réel, opt-in et retrait |

Une ligne refusée ne ferme pas la story : elle ouvre une correction précisément rattachée à l’étape observée. Une ligne acceptée ne vaut clôture qu’après consignation du verdict au SHA reçu.
