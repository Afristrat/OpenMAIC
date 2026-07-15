# 06 — Brand brief · Chantier 0 — SOCLE (référence plateforme)

> **Fil conducteur** — Ce document est LE brand brief de référence de la plateforme : les 06 des chantiers 1-3 ne le recopient pas, ils y renvoient et n'ajoutent que leur couche propre (chantier 2 : voix des personnalités ; chantier 3 : ton des graines). Source : valeurs EXTRAITES du code porté (`app/globals.css`, `app/layout.tsx`) — pas imaginées.

## Identité

**Qalem (قلم — « le calame »)** — plateforme éducative multi-agent FR/AR/EN. Domaines : qalem.ai-mpower.com = qalem.ma.

## Ressenti cible (3 mots, contradictions tranchées)

**Vivant · Rigoureux · Bienveillant.** Tranché : « vivant » (classe qui parle, personnalités) prime sur « institutionnel » dans l'UI ; « rigoureux » prime dans le contenu pédagogique et les évaluations. Pas de gamification criarde : la chaleur vient des agents, pas des confettis.

## Palette (extraite de `app/globals.css` — source de vérité, ne pas dupliquer ailleurs)

| Rôle | Clair | Sombre |
|---|---|---|
| `--primary` | `#722ed1` (violet) | `#d5baff` |
| `--background` | `#faf8ff` | `#0b1326` |
| `--foreground` | `#131b2e` | `#dae2fd` |
| `--accent` | `#f2f3ff` | `#222a3d` |
| `--primary-foreground` | `#ffffff` | `#0b1326` |

Règle : tout nouvel écran consomme les variables CSS, jamais de hex en dur (le thème clair/sombre est déjà câblé).

## Typographie

Celle portée par la base (source de vérité : `app/layout.tsx` / `globals.css` de la branche `refork-v030` après S0-005). Contrainte non négociable : la police doit couvrir l'arabe avec un rendu de qualité égale au latin — toute proposition de changement de police se teste d'abord en ar-MA.

## Langues et directionnalité

- **3 locales UI** : fr-FR, ar-MA, en-US. zh-CN retiré de l'UI, conservé comme fallback code.
- **RTL de premier rang** : ar-MA n'est pas une traduction, c'est un mode de rendu (`HtmlDirectionManager`, `rtl-flip` sur les icônes directionnelles). Tout composant se conçoit RTL-compatible d'emblée.
- **Arabe standard moderne** dans l'UI (pas de darija). Français : accents irréprochables, majuscules accentuées incluses (É, À, Ç…).

## Ton du copy — 3 exemples dans la voix

- **Message d'erreur** : « La génération n'a pas abouti. Vos réglages sont conservés — relancez quand vous voulez, ou changez de fournisseur dans les paramètres. » (jamais de code d'erreur brut seul, jamais de culpabilisation)
- **Empty state** (bibliothèque vide) : « Votre première classe n'attend que vous. Donnez un sujet, ou déposez un document — l'équipe pédagogique s'occupe du reste. »
- **E-mail de bienvenue** : « Bienvenue sur Qalem. Ici, on n'apprend pas seul : une équipe d'enseignants et de camarades IA fait cours avec vous, en direct. Lancez votre première formation — elle est déjà prête à vous surprendre. »

Registre : vouvoiement en FR ; deuxième personne respectueuse en AR ; « you » direct en EN.
