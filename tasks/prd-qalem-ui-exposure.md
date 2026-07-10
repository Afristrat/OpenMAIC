[PRD]
# PRD : Exposition UI de toutes les features backend Qalem

## Overview

Le backend Qalem dispose de 20+ systèmes implémentés dont seulement ~20% sont accessibles via l'UI. Ce PRD couvre la création de TOUTES les pages, composants et flows nécessaires pour que chaque feature backend soit utilisable par un utilisateur final.

## Quality Gates

Ces commandes doivent passer pour chaque user story :
- `npx tsc --noEmit` — Type checking
- `pnpm lint` — ESLint
- `pnpm test` — Tests unitaires
- `pnpm test:e2e` — Tests E2E Playwright

Pour les stories UI :
- Vérification visuelle dans le navigateur

## User Stories

### US-001: Fix page profil — bouton Enregistrer explicite
**Description:** En tant qu'utilisateur, je veux un bouton Enregistrer visible sur ma page profil.
**Acceptance Criteria:**
- [ ] Bouton Enregistrer en bas du formulaire profil (app/profile/page.tsx)
- [ ] Bouton désactivé si aucune modification
- [ ] Toast de confirmation au clic
- [ ] i18n FR/AR/EN

### US-002: Séparer Administration, Clés API et Paramètres en pages distinctes
**Description:** En tant qu'utilisateur, je veux que ces 3 liens mènent à des pages différentes.
**Acceptance Criteria:**
- [ ] /settings → page avec onglets Général, Audio, ASR, Notifications
- [ ] /admin → page super admin avec providers, clés API, image, video, PDF, web-search
- [ ] Le SettingsDialog modal est conservé uniquement dans le header classroom
- [ ] Chaque page est autonome

### US-003: Page paramètres notifications
**Description:** En tant qu'utilisateur, je veux configurer mes notifications depuis les paramètres.
**Acceptance Criteria:**
- [ ] Section Notifications dans /settings avec toggles Email, Push, WhatsApp
- [ ] Champ numéro WhatsApp si toggle activé
- [ ] Bouton permission push navigateur
- [ ] Sauvegarde localStorage + Supabase

### US-004: Bouton Créer une organisation dans la sidebar
**Description:** En tant qu'utilisateur authentifié, je veux créer une organisation.
**Acceptance Criteria:**
- [ ] Lien Créer une organisation si pas d'org
- [ ] Formulaire nom + secteur + logo
- [ ] POST /api/organizations, utilisateur devient admin
- [ ] Sidebar mise à jour avec liens org

### US-005: Invitation de membres avec lien
**Description:** En tant qu'admin, je veux inviter des membres par email ou lien.
**Acceptance Criteria:**
- [ ] Champ email + sélecteur rôle dans /org/[id]/admin
- [ ] Bouton Copier le lien d'invitation
- [ ] Table Supabase org_invitations (token, org_id, role, expires_at)
- [ ] Invitations expirent après 7 jours

### US-006: Dashboard admin organisation amélioré
**Description:** En tant qu'admin, je veux voir les métriques clés de mon organisation.
**Acceptance Criteria:**
- [ ] 4 cartes métriques en haut de /org/[id]/admin
- [ ] Graphique activité 30 jours
- [ ] Liste membres avec dernière activité et actions

### US-007: Bouton Obtenir le certificat dans la vue classroom
**Description:** En tant qu'apprenant, je veux obtenir un certificat quand j'ai terminé un cours.
**Acceptance Criteria:**
- [ ] Bouton visible quand toutes scènes vues ET score >= 60%
- [ ] Modal avec certificat HTML + boutons PDF/LinkedIn/lien
- [ ] Badge Certifié sur le classroom card

### US-008: Page Mes certificats
**Description:** En tant qu'apprenant, je veux voir tous mes certificats.
**Acceptance Criteria:**
- [ ] Page /certificates accessible depuis la sidebar
- [ ] Grille de certificats avec nom cours, date, score
- [ ] Chaque certificat cliquable → modal détail
- [ ] État vide si aucun certificat

### US-009: Page Skills disponibles
**Description:** En tant qu'utilisateur, je veux explorer les skills disponibles.
**Acceptance Criteria:**
- [ ] Page /skills accessible depuis la sidebar
- [ ] Grille de cartes par skill (Formation Design Pro, Medical, Legal, Coding)
- [ ] Détail : agents, templates, prompt overrides
- [ ] Bouton Utiliser ce skill → home avec skill pré-sélectionné

### US-010: Page Plugins de scènes
**Description:** En tant qu'utilisateur, je veux découvrir les scènes interactives.
**Acceptance Criteria:**
- [ ] Page /plugins accessible depuis la sidebar
- [ ] Cartes Code Sandbox et Lab Simulation 3D
- [ ] Bouton Essayer → iframe pleine page avec données d'exemple

### US-011: Publier un agent sur la marketplace
**Description:** En tant que formateur, je veux publier un agent personnalisé.
**Acceptance Criteria:**
- [ ] Bouton Publier sur chaque agent custom dans la config agents
- [ ] Formulaire tags, description
- [ ] POST /api/marketplace/agents
- [ ] Confirmation toast

### US-012: Détail agent marketplace + avis
**Description:** En tant qu'utilisateur, je veux voir les détails d'un agent et laisser un avis.
**Acceptance Criteria:**
- [ ] Page /marketplace/agents/[id] avec détails complets
- [ ] Section avis avec liste + formulaire étoiles + commentaire
- [ ] Un seul avis par utilisateur par agent

### US-013: Page pricing publique
**Description:** En tant que visiteur, je veux voir les offres et prix.
**Acceptance Criteria:**
- [ ] Page /pricing accessible sans connexion
- [ ] 3 cartes : Gratuit, Professionnel (3000 MAD), Institution (sur devis)
- [ ] Pricing en MAD
- [ ] i18n FR/AR/EN

### US-014: Page de paiement
**Description:** En tant qu'utilisateur, je veux payer via mobile money.
**Acceptance Criteria:**
- [ ] Page /pay avec sélection provider (Orange Money, Wave, CinetPay)
- [ ] POST /api/payments/initiate → redirection provider
- [ ] Page /pay/success avec confirmation

### US-015: Configuration MCP dans admin
**Description:** En tant que super admin, je veux configurer les serveurs MCP depuis l'UI.
**Acceptance Criteria:**
- [ ] Section Serveurs MCP dans /admin
- [ ] Liste serveurs avec statut (connecté/erreur)
- [ ] Bouton Tester la connexion
- [ ] Bouton Ajouter un serveur

### US-016: Configuration LTI dans admin
**Description:** En tant que super admin, je veux configurer LTI depuis l'UI.
**Acceptance Criteria:**
- [ ] Section LTI dans /admin
- [ ] Config JSON pour enregistrement LMS (copier)
- [ ] Liste plateformes enregistrées
- [ ] Formulaire ajout plateforme

### US-017: Dashboard Pedagogy Genome dans admin
**Description:** En tant que super admin, je veux voir les données du Pedagogy Genome.
**Acceptance Criteria:**
- [ ] Section dans /admin avec métriques globales
- [ ] Top 10 séquences efficaces
- [ ] Indicateur seuil activation X/100

### US-018: Widget xAPI status dans admin
**Description:** En tant que super admin, je veux voir si xAPI fonctionne.
**Acceptance Criteria:**
- [ ] Section xAPI dans /admin avec statut configuré/non
- [ ] Bouton envoyer statement de test

### US-019: Indicateur de sync dans la sidebar
**Description:** En tant qu'utilisateur, je veux voir l'état de synchronisation.
**Acceptance Criteria:**
- [ ] Icône sync en bas de sidebar avec statut couleur
- [ ] Badge nombre d'éléments en attente
- [ ] Clic → sync manuelle

### US-020: Bannière Installer l'application PWA
**Description:** En tant qu'utilisateur mobile, je veux installer Qalem.
**Acceptance Criteria:**
- [ ] Bannière dismissable en haut de page
- [ ] Bouton Installer → prompt PWA natif
- [ ] Ne s'affiche pas si déjà installé ou dismiss

### US-021: Bannière consentement télémétrie RGPD
**Description:** En tant qu'utilisateur, je veux donner mon consentement avant la collecte de données.
**Acceptance Criteria:**
- [ ] Bannière au premier login : Accepter/Refuser/En savoir plus
- [ ] Stocké dans telemetry_consent (Supabase)
- [ ] Si refusé : aucune collecte
- [ ] Modifiable dans /settings

## Functional Requirements

- FR-1: Chaque feature backend a un lien dans la sidebar
- FR-2: Pages admin accessibles uniquement au super admin
- FR-3: Pages org nécessitent appartenance à une org
- FR-4: Dark/light mode + RTL arabe sur toutes les pages
- FR-5: Toutes les chaînes via i18n (FR/AR/EN natif)
- FR-6: Responsive mobile-first pour pages publiques
- FR-7: Sidebar dynamique selon état utilisateur

## Non-Goals

- Refactoring backend
- Nouveaux endpoints API (sauf US-005 invitations)
- Design pixel-perfect (sprint dédié ultérieur)

## Success Metrics

- 100% features backend accessibles via UI
- Parcours inscription → org → cours → certificat < 10 min
- Super admin configure tout sans fichiers de config

[/PRD]
