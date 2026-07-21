# Contrat de promotion par évaluation

Une capacité joignable ne devient utilisable pour une tâche qu'après une décision de promotion traçable. Aucun seuil universel n'est intégré au moteur : chaque politique versionnée déclare ses cas, ses checks et ses seuils.

Une politique `candidate` ou `retired` ne peut jamais promouvoir. Le statut `approved` exige une date et une référence d'approbation antérieures au run évalué.

## Politique obligatoire

- identifiant, tâche et capacité ;
- identifiants exacts du golden set ;
- checks déterministes exigés pour chaque cas ;
- langues à couvrir et score linguistique minimal, lorsque la tâche produit du langage ;
- version de la rubrique du juge ;
- score minimal du juge ;
- taille minimale, accord minimal et taux maximal de faux positifs pour sa calibration ;
- exigence éventuelle d'un juge indépendant du modèle évalué ;
- nombre minimal de cas relus par des humains et taux maximal de rejet accepté.

## Run recevable

Le run relie chaque cas à son artefact, chaque check à sa preuve, chaque jugement à sa sortie et chaque revue humaine à une référence pseudonymisée. La calibration doit être valide à la date de clôture du run et porter exactement la version de rubrique demandée.

## Décision

La promotion échoue si un cas du golden set manque, si un check manque ou échoue, si le juge est insuffisamment calibré, si un score passe sous le seuil, si une langue manque, ou si l'échantillon humain est insuffisant ou trop souvent rejeté. Tous les motifs sont retournés ; aucun premier échec ne masque les suivants.

La validation enregistrée conserve la politique, le run et les références des trois familles de preuves. Une nouvelle évaluation en échec invalide la tâche sans supprimer les runs antérieurs.
