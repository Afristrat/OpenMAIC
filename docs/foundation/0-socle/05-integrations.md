# 05 — Intégrations · Chantier 0 — SOCLE

> **Fil conducteur** — Amont : coffre DPAPI + registre CLI du CLAUDE.md global (l'existant d'abord — la meilleure intégration est celle qu'on possède déjà). Aval : les chantiers 1-3 héritent de ce tableau et n'y AJOUTENT que leurs services propres (Hyperframes au 1, watermarking au 2, push/xAPI au 3) avec ADR Ponytail échelons 2-5 (« npm install » n'est jamais le premier réflexe).

## Tableau des dépendances externes du socle

| Service | Usage | Clé/compte (nom coffre — jamais la valeur) | Coût/limites | Criticité (l'app survit-elle ?) | Repli |
|---|---|---|---|---|---|
| Supabase (self-host serveuria) | Auth, DB Postgres, RLS | `SRV_SUPABASE_*` | Auto-hébergé, coût serveur | ❌ Non — cœur données | Sauvegardes Postgres ; restauration testée avant bascule prod |
| Higgs TTS (DGX-2 `.7:7861`, API compat OpenAI) | Voix des agents (FR ; AR non tranché) | endpoint interne, pas de clé | Local, GPU partagé — ⚠️ `deepseek-on` coupe le studio `.7` | Oui — dégradé (classe muette) | File d'attente + retry BullMQ ; provider TTS alternatif via `server-providers.yml` |
| Providers LLM (multi, via env / `server-providers.yml`) | Génération, orchestration director | `{PROVIDER}_API_KEY` (coffre) | Selon provider | ❌ Non — cœur génération | Multi-provider natif : bascule par config, zéro code |
| Redis (serveuria) | BullMQ (jobs asynchrones) | connexion interne | Auto-hébergé | Oui — dégradé (pas de jobs différés) | Jobs rejouables ; redémarrage Coolify |
| Coolify (serveuria) | Déploiement préprod puis prod | `COOLIFY_API_TOKEN` (coffre) | Auto-hébergé | Oui (déploiement seulement) | Déploiement docker compose manuel via SSH |
| GitHub `Afristrat` (privé) | Remote du repo — permanence (règle n°4) | PAT machine (config git) | Plan actuel | Oui (dev local possible) | Remote de secours possible ; bundle git local |
| SSH serveuria | Commandes serveur directes | clés `~/.ssh/serveurai_mnemo` / `serveurai_key` | — | Oui | Deux clés valides interchangeables (vérifié 2026-05-28) |

## Règles

1. **Aucun nouveau service au chantier 0** — le socle porte l'existant, il n'introduit rien. Toute exception = ADR avec preuve qu'aucun échelon inférieur ne suffisait.
2. Les appels de vérification (S0-006) prouvent chaque provider par code HTTP réel au moment du portage — jamais « ça marchait sur l'ancienne base ».
3. Secrets : uniquement `$env:*` depuis le coffre DPAPI ; protocole anti-leak du CLAUDE.md global.
4. ⚠️ Contention GPU documentée : Higgs (`.7:7861`) et DeepSeek partagent le studio — les stories TTS vérifient la disponibilité AVANT de conclure à une panne (SOP-007 : jamais de supposition sur un système tiers).
