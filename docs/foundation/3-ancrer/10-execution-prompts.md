# 10 — Execution prompts · Chantier 3 — ANCRER

> **Fil conducteur** — Tronc : gabarit P0-A du socle, instancié `[S3-XXX]`. S'ajoutent les prompts propres à l'ancrage.

## P3-A — Bloc CONTEXTE des children Ralph du chantier (instancier P0-A)

```text
CONTEXTE : chantier ANCRER (post-formation 10-90 jours) sur la base refork-v030.
Règles dures : aucun plan sans opt-in explicite (colonne opted_in_at) ; borne J+90
en contrainte ; les graines se génèrent UNE FOIS à la fin de session (jamais d'appel
LLM par envoi) ; canal push PWA uniquement — e-mail/WhatsApp du module notifications
sont des placeholders, ne les câble pas ; reporting org = agrégats seulement, aucun
drill-down individuel ; xAPI = outbox asynchrone, jamais d'appel LRS synchrone.
FSRS existe dans lib/spaced-repetition/ : étends-le, ne le réécris pas.
```

## P3-B — Générateur de graines (S3-004 — le prompt LLM embarqué, versionné ici)

```text
Tu es l'équipe pédagogique d'une session de formation qui vient de se terminer.
À partir du RÉSUMÉ DE SESSION fourni (scènes vues, moments marquants, quiz joués,
casting : personnalités + prénoms), génère un STOCK de graines d'ancrage mémoriel.

RÈGLES :
- Chaque graine est SIGNÉE par une personnalité du casting fourni et parle dans
  son registre (le Rigolo : humour bienveillant portant un concept ; le Secrétaire :
  synthèse fidèle ; le Penseur : profondeur ; l'Analyste : précision chiffrée ; etc.).
- Chaque graine CITE un moment précis de la session (référence scene_ref fournie) —
  rien de générique réutilisable dans une autre session.
- Types à produire : anecdote (4+), highlight (4+), joke (2+), quiz_reminder (2+).
- Accroche push ≤ 90 caractères ; corps ≤ 60 mots ; langue = celle de la session.
- Arabe : standard moderne. Français : accents irréprochables, majuscules incluses.
- INTERDIT : promotion commerciale, culpabilisation, comparaison à d'autres apprenants.

FORMAT DE SORTIE : JSON array conforme à
[{ "persona": "...", "kind": "anecdote|highlight|joke|quiz_reminder",
   "content": { "push_hook": "...", "body": "...", "scene_ref": "..." } }]
Rien d'autre que le JSON.
```

## P3-C — Vérification xAPI (S3-010 — protocole)

1. Monter un LRS de test local (conteneur jetable — ex. LRS SQL open source ; choix consigné en ADR au moment de la story).
2. Émettre les statements des événements types : session vécue, quiz répondu, éval à chaud, éval à froid, graine ouverte.
3. Vérifier côté LRS : statements acceptés (200), verbes/objets conformes au profil xAPI choisi, acteur pseudonymisé (aucun e-mail/nom en clair).
4. Couper le LRS → émettre → vérifier que l'outbox retient et rejoue à la reconnexion (retry prouvé).
