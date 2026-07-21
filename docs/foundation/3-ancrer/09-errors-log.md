# 09 — Errors log · Chantier 3 — ANCRER

> **Fil conducteur** — Mêmes règles que `0-socle/09`. Amorcé avec les pièges connus du domaine.

## Entrées (amorce — pièges connus)

### 2026-07-09 — Notifications e-mail/WhatsApp : placeholders qui ont l'air câblés (dette identifiée, pas encore payée ici)
- **Symptôme attendu** : une story « envoyer la graine par e-mail » semblerait triviale — le module existe (`lib/notifications/index.ts`).
- **Cause racine** : e-mail et WhatsApp y sont des PLACEHOLDERS explicites (en-têtes le disant) ; seul le push PWA est réel (`sw-notifications.js`).
- **Prévention** : ADR-303 fige le canal v1 ; toute story « canal » commence par lire le module et vérifier ce qui est réel.
- **Leçon** : un module présent n'est pas un module câblé — vérifier l'appel de bout en bout (règle vitrine/câblé de l'audit).

### 2026-07-09 — FSRS porté : extracteur sans lien avec le plan compilé
- **Symptôme attendu** : les rappels espacés fonctionnent mais ancrent des items déconnectés des objectifs pédagogiques du course.
- **Cause racine** : `lib/spaced-repetition/` extrait des items sans lien avec la taxonomie des objectifs (dette relevée à l'audit 2026-07-09).
- **Prévention** : S3-006 teste le CYCLE complet ; le lien au plan compilé est au parking lot avec déclencheur explicite — ne pas le « corriger en passant » dans une story de planification.
- **Leçon** : consigner la dette au bon endroit vaut mieux qu'une refonte opportuniste hors scope.

### Gabarit d'entrée

```
### AAAA-MM-JJ — Titre court
- **Symptôme** :
- **Cause racine** :
- **Fix** :
- **Leçon** :
```
