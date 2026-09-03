# DPIA — S2-004 Enregistrement des sessions live

> **Statut : GO DPO POUR DÉVELOPPEMENT — activation en production interdite.**
> Décision explicite de Med Amine MANSOURI IDRISSI, DPO et gérant d’AIMPower
> SARL A.U., consignée le 3 septembre 2026 à 22 h 18 (UTC+1). La formalité CNDP
> applicable et les preuves techniques de la section 3 restent obligatoires avant
> toute activation en production.

## 1. Décision de gate

**Décision actuelle : GO pour construire et tester la persistance des interventions
utilisateur ; NO-GO pour l’activer en production.**
Le replay envisagé traite texte, voix et métadonnées d’activité. La loi marocaine
09-08 définit expressément les données personnelles comme toute information,
« y compris le son et l’image », concernant une personne identifiable. La CNDP
indique que les traitements dont le responsable ou les moyens sont situés au Maroc
doivent respecter cette loi. Le RGPD, lorsqu’applicable, impose une analyse
d’impact avant un traitement susceptible d’engendrer un risque élevé.

Sources primaires vérifiées le 22 juillet 2026, à revalider avant l’activation en
production :

- [Loi marocaine 09-08 — CNDP](https://www.cndp.ma/wp-content/uploads/2023/11/Loi-09-08-Fr.pdf)
- [Cadre CNDP des traitements au Maroc](https://www.cndp.ma/traitement-des-donnees-personnelles-au-maroc/)
- [RGPD, articles 35 et 36 — EUR-Lex](https://eur-lex.europa.eu/legal-content/FR-EN/TXT/?uri=CELEX:32016R0679)

## 2. Description nécessaire et proportionnée

| Élément | Décision de conception | Justification |
|---|---|---|
| Finalité | Permettre à l’apprenant de revivre sa propre session. | Aucun usage d’identification biométrique, de profilage publicitaire ou de notation automatique. |
| Données | Événements agents, texte utilisateur, référence de piste audio utilisateur, métadonnées de session. | Limitation stricte au replay. |
| Déclenchement | Opt-in explicite par session, jamais précoché. | Le live fonctionne sans enregistrement. |
| Accès | Propriétaire de la session et rôle de service uniquement. | RLS et proxy autorisé ; aucun bucket public. |
| Restitution | Streaming dans Qalem, jamais téléchargement. | Réduit l’exfiltration et respecte le contrat produit. |
| Effacement | Suppression effective des événements et pistes à la demande ; conservation par défaut de 30 jours. | À implémenter et tester avant ouverture publique de S2-006. |

## 3. Risques et mesures exigées avant GO

| Risque | Gravité | Mesure exigée | État |
|---|---:|---|---|
| Captation de voix sans compréhension | élevée | Copy localisée : qui, quoi, durée, suppression ; opt-in non précoché ; preuve d’action horodatée. | À implémenter |
| Conservation excessive | élevée | Rétention par défaut de 30 jours + purge contrôlée + test de suppression audio et événements. | À implémenter |
| Accès par un collègue/tenant | élevée | RLS propriétaire, service-only write, tests d’isolation réels. | À implémenter |
| Fuite de piste audio | élevée | Bucket privé, URL signée courte/proxy autorisé, chiffrement en transit, journal d’accès minimal. | À implémenter |
| Détournement biométrique | élevée | Interdiction explicite d’identification, d’empreinte vocale et de réutilisation TTS sans consentement distinct. | À implémenter |
| Export non maîtrisé | moyenne | Aucune route `Content-Disposition: attachment`, test négatif. | À implémenter |

## 4. Décisions du responsable de traitement requises

1. **Responsable de traitement** : AIMPower SARL A.U., SARL A.U. de droit marocain,
   32 Rue Al Banafsaj, résidence Ezzaitouna, 2ᵉ étage, Apt 21, Casablanca 20390,
   Royaume du Maroc. RC Casablanca 618105 ; ICE 003438689000014 ; IF 60276299.
   Contact opposable : a.mansouri@ai-mpower.com. Contact public : contact@taqwim.ma.
2. **Durée de conservation par défaut** : 30 jours, avec suppression effective à la
   demande de l’utilisateur.
3. **Cadre CNDP applicable et formalité nécessaire avant production** : à confirmer
   au regard de l’état réglementaire applicable le jour du lancement. Le GO DPO du
   3 septembre 2026 autorise le développement, pas l’ouverture du traitement aux
   utilisateurs réels ni le franchissement de cette formalité externe.
4. **Territoires et sous-traitants** : traitement exclusivement auto-hébergé sous le
   contrôle d’AIMPower ; aucun fournisseur cloud ne traite les données d’un replay.
   Le détail d’infrastructure ne figure pas dans la DPIA publique.
5. **DPO / contact privacy** : Med Amine MANSOURI IDRISSI, Gérant et Associé Unique
   d’AIMPower SARL A.U. Contact DPO : dpo@ai-mpower.com.

## 5. Conditions de sortie de gate

S2-004 peut être développée et testée depuis le GO DPO consigné le 3 septembre
2026. Le flag d’enregistrement reste désactivé en production tant que la formalité
CNDP applicable n’est pas datée et que les mesures de la section 3 ne sont pas
implémentées et prouvées. Une modification de la finalité, de la durée de
rétention, des sous-traitants ou du risque impose une révision de ce dossier avant
traitement.

## 6. Registre d’approbation

| Date et heure | Décideur | Décision | Portée |
|---|---|---|---|
| 2026-09-03 22:18 UTC+1 | Med Amine MANSOURI IDRISSI, DPO et gérant d’AIMPower SARL A.U. | « Go DPO » | Développement et tests de S2-004 à S3-010 sous les mesures du présent dossier ; aucune activation de l’enregistrement en production avant la formalité CNDP applicable. |
