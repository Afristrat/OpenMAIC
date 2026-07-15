# 10 — Execution prompts · Chantier 2 — VIVRE

> **Fil conducteur** — Tronc : gabarit P0-A du socle, instancié `[S2-XXX]`. S'ajoutent les prompts propres au cœur.

## P2-A — Bloc CONTEXTE des children Ralph du chantier (instancier P0-A)

```text
CONTEXTE : chantier VIVRE sur la base refork-v030. Le live multi-agents (director
LangGraph, moteur d'actions, TTS) est LA feature de la plateforme : toute story qui
le touche prouve par e2e que la classe parle encore avant passes=true.
Règles dures : session_events est append-only (aucun UPDATE) ; aucune route ne sert
un artefact de session en téléchargement (streaming uniquement) ; le watermarking
tourne en job BullMQ, jamais dans le chemin de lecture ; l'enregistrement exige le
consentement UI explicite (colonne recorded) ; la variation du casting est garantie
par la contrainte SQL unique(user_id, course_id, lineup_hash), pas par du code.
Les référentiels culture→prénoms sont des fichiers de données : tu peux les CONSOMMER,
jamais en inventer le contenu (validation humaine requise).
```

## P2-B — Génération des référentiels culture → prénoms (prépare S2-011 — validation Amine obligatoire)

```text
Tu prépares des RÉFÉRENTIELS DE PRÉNOMS pour des agents pédagogiques IA dont les
prénoms s'adaptent à la culture de l'utilisateur. Ces listes seront REVUES ET
VALIDÉES par un humain propriétaire du produit avant tout usage : tu proposes,
tu ne décides pas.

Pour chaque référentiel demandé (ex. : Maroc arabophone, Maroc francophone,
France, monde anglophone) produis un fichier JSON :
{ "culture": "<code>", "names": { "female": ["…"], "male": ["…"] } }

EXIGENCES :
- Prénoms RÉELLEMENT portés aujourd'hui dans cette culture, contemporains,
  mixte générationnel plausible pour des enseignants et des étudiants.
- ZÉRO stéréotype ni folklore ; zéro prénom prêtant à moquerie.
- 20 prénoms minimum par genre et par culture (la variation du casting en dépend).
- Pour l'arabe : fournir la graphie arabe ET la romanisation usuelle.
- Si tu n'es pas sûr qu'un prénom est approprié dans la culture : ne le mets pas.
FORMAT DE SORTIE : un JSON par culture, valide, rien d'autre.
```

## P2-C — Test de robustesse watermark (S2-008/S2-009 — protocole exécutable)

Protocole binaire à automatiser (le critère de la story y renvoie) :

1. Marquer un artefact audio de session réelle (`audiowmark add`, ID connu).
2. Attaques : ré-encodage mp3 128k → ogg → extrait de 30 s → normalisation volume.
3. `audiowmark get` sur chaque variante → l'ID doit ressortir intact sur TOUTES.
4. Visuel : capture d'écran du flux en lecture → l'identifiant visuel doit être décodable sur la capture.
5. Un seul échec = story non passée ; consigner la variante qui casse dans le 09-errors-log et passer à l'alternative (audioseal / incrustation renforcée).
