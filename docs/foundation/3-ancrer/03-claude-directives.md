# 03 — Directives Claude · Chantier 3 — ANCRER

> **Fil conducteur** — Hérite du `0-socle/03` (tronc). Spécifique à l'ancrage post-formation.

## Spécifique au chantier

1. **Opt-in d'abord** : aucun plan d'ancrage sans `opted_in_at` ; « pause » en un tap depuis chaque push ; borne dure J+90 en contrainte (pas de sollicitation infinie — c'est une règle produit ET légale).
2. **Le stock, pas le flux** : les graines se génèrent UNE FOIS à la fin de session (ADR-301) ; toute story qui appellerait un LLM à chaque envoi sera refusée en review (coût récurrent non borné).
3. **Registre des personnalités** : une graine parle DANS la voix de son `persona` (le Rigolo blague, le Secrétaire synthétise) — le contenu dérive de la session vécue (citer la scène source), jamais du générique. Le TON de référence est validé par Amine sur échantillon avant activation (checkpoint S3-008).
4. **FSRS : étendre le porté, pas le réécrire** : `lib/spaced-repetition/` copié-adapté est la référence ; le lien objectifs→items (dette Bloom identifiée) se traite par story dédiée, pas en refonte opportuniste.
5. **Push = PWA uniquement en v1** (ADR-303) ; e-mail/WhatsApp restent des placeholders — ne pas les « finir en passant ».
6. **Mesure d'engagement minimale** : `sent_at`/`opened_at` suffisent — pas de tracking tiers, pas d'analytics externe.
7. **xAPI** : émission via `xapi_outbox` + worker (retry, jamais d'appel LRS synchrone dans le chemin utilisateur) ; les statements pseudonymisent l'acteur.
8. **Reporting** : agrégats par org en lecture seule ; jamais de drill-down individuel offert à l'organisation sans base contractuelle (cf. 07-legal).

## Pointeurs

`02-data-dictionary.md` (5 tables) · `04-feature-backlog.md` · ADR 3xx : `08-decisions-log.md` · transverses : `0-socle/08`.
