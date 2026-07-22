# DPIA — S2-004 Enregistrement des sessions live

> **Statut : DRAFT — non approuvé.** Ce dossier interdit tout build d’enregistrement
> tant que le responsable de traitement n’a pas renseigné les décisions marquées
> `À VALIDER` et qu’un conseil juridique ou DPO compétent n’a pas revu le résultat.

## 1. Décision de gate

**Décision actuelle : NO-GO pour la persistance des interventions utilisateur.**
Le replay envisagé traite texte, voix et métadonnées d’activité. La loi marocaine
09-08 définit expressément les données personnelles comme toute information,
« y compris le son et l’image », concernant une personne identifiable. La CNDP
indique que les traitements dont le responsable ou les moyens sont situés au Maroc
doivent respecter cette loi. Le RGPD, lorsqu’applicable, impose une analyse
d’impact avant un traitement susceptible d’engendrer un risque élevé.

Sources primaires, vérifiées le 2026-07-22 :

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
| Effacement | Suppression effective des événements et pistes à la demande. | À implémenter avant ouverture publique de S2-006. |

## 3. Risques et mesures exigées avant GO

| Risque | Gravité | Mesure exigée | État |
|---|---:|---|---|
| Captation de voix sans compréhension | élevée | Copy localisée : qui, quoi, durée, suppression ; opt-in non précoché ; preuve d’action horodatée. | À implémenter |
| Conservation excessive | élevée | Durée de rétention explicite + purge contrôlée + test de suppression audio et événements. | **À VALIDER : durée** |
| Accès par un collègue/tenant | élevée | RLS propriétaire, service-only write, tests d’isolation réels. | À implémenter |
| Fuite de piste audio | élevée | Bucket privé, URL signée courte/proxy autorisé, chiffrement en transit, journal d’accès minimal. | À implémenter |
| Détournement biométrique | élevée | Interdiction explicite d’identification, d’empreinte vocale et de réutilisation TTS sans consentement distinct. | À implémenter |
| Export non maîtrisé | moyenne | Aucune route `Content-Disposition: attachment`, test négatif. | À implémenter |

## 4. Décisions du responsable de traitement requises

1. **Identité et coordonnées du responsable de traitement** : À VALIDER.
2. **Durée de conservation par défaut** : À VALIDER.
3. **Cadre CNDP applicable et formalité nécessaire avant production** : À VALIDER
   avec conseil compétent et état réglementaire au jour du lancement.
4. **Territoires et sous-traitants réellement impliqués** : À VALIDER après
   inventaire des fournisseurs audio, stockage et observabilité.
5. **DPO ou contact privacy** : À VALIDER.

## 5. Conditions de sortie de gate

S2-004 peut commencer uniquement lorsque les cinq décisions ci-dessus sont
datées et approuvées, et lorsque les mesures de la section 3 sont traduites en
critères testables. Une modification de la finalité, de la durée de rétention,
des sous-traitants ou du risque impose une révision de ce dossier avant traitement.
