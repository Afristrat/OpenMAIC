# 07 — Legal & compliance · Chantier 3 — ANCRER

> **Fil conducteur** — Hérite du 0-SOCLE. Couche propre : sollicitations répétées sur 90 jours + mesures d'évaluation individuelles + transfert xAPI vers des LRS tiers. Textes à re-vérifier en vigueur à l'instruction ; audit délégué à `rgpd-bounty-hunter`.

## 1. Sollicitations 10-90 jours (pushes)

- **Nature** : communications de SERVICE liées à la formation suivie (continuité pédagogique), pas de la prospection — tant qu'aucune graine ne promeut autre chose que LA formation vécue et le service. Une graine qui pousserait une offre commerciale changerait de régime (prospection = règles d'opt-in distinctes) : interdit en v1 par construction (le générateur ne connaît que la session).
- **Garanties par construction** (déjà en contraintes/directives) : opt-in explicite (`opted_in_at`), pause en un tap, borne dure J+90, arrêt = effacement des deliveries futures.
- **Fréquence** : le plan validé par Amine (S3-008) fait foi ; jamais d'augmentation de fréquence par « croissance » sans revalidation.

## 2. Évaluations et reporting aux organisations

- **Risque spécifique** : l'évaluation à froid mesure l'APPRENANT dans la durée ; livrée en drill-down à son employeur, elle devient un outil d'évaluation du salarié — dérive de finalité.
- **Garantie v1** : reporting org = AGRÉGATS uniquement (S3-009) ; tout accès individuel exigerait une base contractuelle explicite (décision Amine + mention dans le contrat org) — non construit en v1.
- **Réponses en texte libre** (`evaluations.answers`) : peuvent contenir des données personnelles — rétention alignée sur celle du compte, purge à la suppression.

## 3. Émission xAPI vers LRS tiers

- **Transfert de données vers un système CLIENT** : l'org est responsable de son LRS ; Qalem agit comme émetteur pour le compte de l'org → qualifier la relation (responsable/sous-traitant) dans le contrat org AVANT activation du flag `xapi_emission` chez un client réel.
- **Minimisation par construction** : acteur pseudonymisé dans les statements ; aucun contenu de réponse libre — uniquement verbes/scores/objets.
- **Localisation du LRS client** : hors de notre contrôle — le contrat org doit le dire clairement.

## 4. Dettes assumées du chantier

| Dette | Pourquoi acceptable | Déclencheur |
|---|---|---|
| Régime juridique exact des pushes non instruit pays par pays | Préprod, canal unique PWA, opt-in strict par construction | Bascule prod du flag `anchoring` |
| Contrat org (agrégats, xAPI, responsabilités) non rédigé | Aucune org cliente sur la nouvelle base | Premier client org — AVANT activation des flags concernés |
| Rétention des `evaluations` non chiffrée précisément | Alignée par défaut sur la vie du compte | Politique de confidentialité de la bascule prod |
