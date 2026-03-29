# Qalem — Préparation du Premier Pilote

> Checklist pour lancer un pilote dans un centre de formation ou une université au Maroc.

---

## 1. Cible du pilote

### Profil idéal du premier client

| Critère | Idéal | Acceptable |
|---------|-------|-----------|
| **Type** | Centre de formation professionnelle privé | Université / grande école |
| **Taille** | 50-200 stagiaires | 200-1 000 étudiants |
| **Secteur** | Métiers du digital (aligné Maroc Digital 2030) | Tech / Business / Médical |
| **LMS actuel** | Moodle basique ou aucun | Canvas / Google Classroom |
| **Décideur** | Directeur pédagogique accessible directement | Doyen / chef de département |
| **Localisation** | Casablanca / Rabat | Marrakech / Fès / Tanger |
| **Budget** | Prêt à payer 2 000-5 000 MAD/mois après pilote | Budget formation existant |

### Cibles concrètes à approcher

1. **OFPPT** — Direction régionale Casablanca-Settat (la plus grande)
2. **UM6P** — Université Mohammed VI Polytechnique (la plus tech-forward)
3. **UIR** — Université Internationale de Rabat
4. **ESCA** — École de commerce Casablanca
5. **SkillsCampus** — Centre de formation privé Casablanca
6. **CCL** — Centre de formation continue

### Canal d'approche

- **LinkedIn** : message direct au directeur pédagogique, pas au DG
- **Pitch** : "Vos formateurs peuvent créer un cours complet en 30 minutes au lieu de 15 jours. Démo gratuite de 30 min."
- **Ne pas vendre le produit** — vendre le résultat : gain de temps formateur, engagement apprenant, conformité ADDIE

---

## 2. Pré-requis techniques pour le pilote

### Infrastructure

- [ ] Serveur dédié ou VPS (4 Go RAM, 50 Go SSD) — OVH Maroc ou Hetzner ~200 MAD/mois
- [ ] Nom de domaine configuré (ex: demo.qalem.ma)
- [ ] Certificat SSL (Let's Encrypt)
- [ ] Docker Compose déployé et fonctionnel
- [ ] Clé API LLM configurée (Gemini recommandé = meilleur rapport qualité/prix)
- [ ] Clé API ElevenLabs configurée (voix FR + AR)
- [ ] Backup automatique PostgreSQL (quotidien)
- [ ] Monitoring basique (uptime check minimum)

### Contenu pré-chargé

- [ ] 3 cours de démo jouables (Marketing, Entrepreneuriat, IA)
- [ ] 10 templates entrepreneuriat (déjà créés)
- [ ] Skill Formation Design Pro activé
- [ ] Au moins 1 cours spécifique au domaine du client (à créer ensemble lors de la démo)

### Configuration

- [ ] Organisation créée pour le client
- [ ] Rôles configurés : 1 admin (client), 2-3 formateurs, 20+ apprenants
- [ ] Templates secteur du client pré-sélectionnés
- [ ] Langue par défaut : FR (ou AR selon le client)

---

## 3. Déroulement du pilote (4 semaines)

### Semaine 0 — Installation (avant le pilote)

| Jour | Action |
|------|--------|
| J-7 | Déploiement du serveur + configuration |
| J-5 | Création des comptes formateurs + test interne |
| J-3 | Chargement du contenu spécifique au client |
| J-1 | Test complet du parcours : création cours → classroom → quiz → révision |

### Semaine 1 — Formation des formateurs

| Jour | Action | Durée |
|------|--------|-------|
| Lundi | Atelier "Créer votre premier cours avec Qalem" avec 2-3 formateurs | 2h |
| Mardi | Les formateurs créent 1 cours chacun (accompagnés) | 2h |
| Mercredi | Correction et amélioration des cours créés | 1h |
| Jeudi | Test des cours avec 5 apprenants "cobayes" | 2h |
| Vendredi | Débriefing et ajustements | 1h |

### Semaine 2-3 — Utilisation réelle

- Les formateurs utilisent Qalem avec leurs vrais groupes
- Support technique réactif (WhatsApp direct avec vous)
- Collecte de feedback quotidien (formulaire court)
- Monitoring : nombre de sessions, temps moyen, taux de complétion

### Semaine 4 — Bilan

| Métrique | Objectif minimum |
|----------|-----------------|
| Cours créés par les formateurs | ≥ 5 |
| Apprenants ayant complété au moins 1 cours | ≥ 30 |
| Taux de complétion moyen | ≥ 60% |
| Score satisfaction formateurs (NPS) | ≥ 7/10 |
| Score satisfaction apprenants | ≥ 7/10 |
| Temps moyen création d'un cours (formateur) | ≤ 45 min |

---

## 4. Livrables à fournir au client

### Pendant le pilote
- [ ] Accès à l'instance Qalem dédiée
- [ ] Support WhatsApp réactif (< 2h en heures ouvrables)
- [ ] 1 session de formation initiale (2h)
- [ ] Documentation utilisateur (guide formateur + guide apprenant)

### À la fin du pilote
- [ ] Rapport de pilote : métriques d'usage, feedback, recommandations
- [ ] Comparaison avant/après : temps de création de cours, engagement apprenant
- [ ] Proposition commerciale pour la suite (abonnement mensuel)
- [ ] Témoignage vidéo (si le client est satisfait) — essentiel pour la suite

---

## 5. Pricing post-pilote

| Offre | Contenu | Prix |
|-------|---------|------|
| **Pilote** (4 semaines) | Gratuit — investissement en preuve de concept | 0 MAD |
| **Essentiel** | Instance dédiée, 5 formateurs, 100 apprenants, support email | 3 000 MAD/mois |
| **Professionnel** | Instance dédiée, formateurs illimités, 500 apprenants, support WhatsApp, formation mensuelle | 8 000 MAD/mois |
| **Institution** | Multi-site, SSO, LTI, reporting avancé, SLA 99.5%, formation sur site | Sur devis (15 000-30 000 MAD/mois) |

### Stratégie de conversion

1. **Pilote gratuit** → preuve que ça marche
2. **Offre Essentiel** à 3 000 MAD/mois → accessible, pas de risque
3. **Upgrade naturel** quand le nombre de formateurs/apprenants augmente
4. **Témoignage** du premier client → levier pour le deuxième

---

## 6. Risques du pilote et mitigations

| Risque | Probabilité | Mitigation |
|--------|------------|------------|
| Le LLM génère du contenu incorrect | Moyenne | Formateur vérifie avant diffusion + disclaimer |
| Latence TTS insupportable | Faible | Pré-générer les audios, fallback browser TTS |
| Le client n'utilise pas après la formation | Élevée | Check-in hebdomadaire, montrer les métriques |
| Bug bloquant en production | Moyenne | Hotline WhatsApp, déploiement de fix en < 24h |
| Feedback négatif des apprenants sur la qualité | Moyenne | Ajuster les prompts avec le formateur, personnaliser |
| Le décideur change / budget coupé | Faible | Contrat de pilote signé avec engagement moral |

---

## 7. Template email de prospection

**Objet** : Vos formateurs pourraient créer un cours complet en 30 minutes

**Corps** :

> Bonjour [Nom],
>
> Je suis [Votre Nom], fondateur de Qalem — une plateforme open-source qui transforme n'importe quel sujet en classe interactive avec des professeurs IA.
>
> Concrètement, un formateur décrit un sujet et obtient en quelques minutes :
> - Des slides animées avec narration vocale
> - Des quiz avec correction automatique
> - Un système de révision intelligente pour les apprenants
> - Le tout en français, arabe ou anglais
>
> La plateforme est auto-hébergée (vos données restent chez vous) et conforme aux méthodologies ADDIE et Bloom.
>
> Je propose un pilote gratuit de 4 semaines pour [Nom de l'institution]. Seriez-vous disponible pour une démo de 30 minutes cette semaine ?
>
> Cordialement,
> [Votre Nom]

---

## Checklist finale avant lancement du pilote

- [ ] Serveur déployé et accessible via HTTPS
- [ ] 3+ cours démo jouables
- [ ] Comptes créés pour le client
- [ ] Guide formateur imprimé / PDF
- [ ] Support WhatsApp configuré
- [ ] Backup automatique vérifié
- [ ] Formulaire de feedback prêt
- [ ] Contrat de pilote signé
