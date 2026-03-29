# Qalem — Prompts Stitch pour Landing Page

> Chaque prompt est autonome et optimisé pour Google Stitch.
> Ordre d'exécution recommandé : Design System → Hero → Sections 1-7 → Footer.
> Utiliser le même design system pour TOUS les prompts (copier le bloc DESIGN SYSTEM).

---

## PROMPT 0 — Design System Global

```
Qalem brand design system reference card. Show a clean grid displaying the complete visual language for an AI education platform targeting North Africa.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first, responsive to mobile
- Theme: Light mode (default), with dark mode variant
- Background: Pure White (#ffffff) light / Deep Charcoal (#0f172a) dark
- Surface: Soft Gray (#f8fafc) light / Slate (#1e293b) dark for cards
- Primary Accent: Royal Purple (#722ed1) for CTAs, highlights, brand identity
- Secondary Accent: Emerald Green (#059669) for success states, checkmarks
- Tertiary: Warm Amber (#f59e0b) for badges, warnings, demo tags
- Text Primary: Near Black (#0f172a) light / White (#f8fafc) dark
- Text Secondary: Slate Gray (#64748b) light / Slate (#94a3b8) dark
- Text Accent: Purple (#722ed1) for links and interactive elements
- Gradient Hero: Linear from Purple (#722ed1) to Indigo (#4f46e5) at 135 degrees
- Border: Subtle (#e2e8f0) light / (#334155) dark
- Radius: 12px for cards, 8px for buttons, 24px for pills, full-round for avatars
- Shadows: Soft diffuse (0 4px 24px rgba(0,0,0,0.06)) light / glow (0 0 24px rgba(114,46,209,0.15)) dark
- Font: Inter for body, Geist Sans for headings
- Font sizes: Hero 56px, H1 40px, H2 32px, H3 24px, Body 16px, Small 14px, Caption 12px
- Spacing: 8px base grid, 16px component gap, 32px section gap, 80px between major sections
- Icons: Lucide React style, 24px default, 1.5px stroke
- Animations: Subtle, 300ms ease-out default, scroll-triggered fade-up
- Arabic: Noto Sans Arabic font, RTL layout mirror, right-aligned text
- Language pills: "FR" / "AR" / "EN" in pill badges with flag dots

**Layout:**
- Max content width: 1200px centered
- Navigation: Sticky, glassmorphism backdrop-blur, logo left, CTA right
- Sections: Full-width backgrounds alternating white/gray, content centered
- Mobile: Single column, touch-friendly (44px min tap targets)
```

---

## PROMPT 1 — Navigation + Hero Section

```
A premium, conversion-focused hero section for Qalem — an AI-powered interactive classroom platform for North Africa. The design must feel like a billion-dollar SaaS, not a school project.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, premium, generous whitespace
- Background: Gradient from Purple (#722ed1) to Indigo (#4f46e5) at 135 degrees for the hero, transitioning to white below
- Primary Accent: White text and buttons on gradient background
- Surface: Frosted glass cards (#ffffff/80 with backdrop-blur)
- Radius: 12px cards, 8px buttons, full-round avatars

**Page Structure:**

1. **Sticky Navigation Bar:**
   - Frosted glass background (white/60%, backdrop-blur)
   - Left: Qalem logo (Arabic calligraphy-inspired "قلم" lettermark + "Qalem" wordmark)
   - Center: Navigation links — "Fonctionnalités", "Pour les Institutions", "Pricing", "Démo"
   - Right: Language switcher pill (FR | AR | EN), "Connexion" ghost button, "Essayer Gratuitement" solid purple CTA button
   - Height: 64px, subtle bottom border on scroll

2. **Hero Section (full viewport height):**
   - Left side (60%):
     - Eyebrow badge: Purple pill with "Open Source • AGPL-3.0" in small caps
     - Main headline (56px, bold, white): "Créez un cours complet en 5 minutes"
     - Subheadline (20px, white/80%): "Qalem transforme n'importe quel sujet en classe interactive avec des professeurs et camarades IA — en français, arabe ou anglais."
     - Two CTAs side by side:
       - Primary: "Essayer la Démo" — white background, purple text, large (48px height), rounded, subtle shadow
       - Secondary: "Voir en action ▶" — ghost button, white border, white text
     - Social proof row: "Utilisé par 50+ formateurs au Maroc" with small avatar stack (5 circular photos overlapping)
   - Right side (40%):
     - Floating mockup of the Qalem classroom interface at an angle
     - Showing: slide presentation with the 6 agent avatars in the roundtable below
     - Subtle floating elements: agent chat bubbles appearing, spotlight animation
     - Soft purple glow behind the mockup

3. **Animated Counter Bar (below hero, white background):**
   - Three stats in a horizontal row with animated count-up numbers:
     - "15 jours → 5 minutes" with hourglass icon — labeled "Temps de création"
     - "9 voix naturelles" with audio waveform icon — labeled "Providers TTS"
     - "3 langues" with globe icon — labeled "FR • AR • EN"
   - Each stat card: white background, subtle shadow, rounded, icon in purple

4. **Trusted By / Logos Bar:**
   - "Compatible avec" label
   - Logos: Moodle, Google Classroom, Canvas (LTI), Supabase, Docker
   - Grayscale logos, subtle, spaced evenly
```

---

## PROMPT 2 — Section "Classe Interactive Multi-Agents"

```
A visually stunning feature section showing a multi-agent AI classroom experience. This must be the most impressive section — it's the core differentiator.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light with subtle purple accents
- Background: Soft Gray (#f8fafc)
- Primary Accent: Royal Purple (#722ed1)
- Surface: White (#ffffff) for cards with soft shadow
- Text: Near Black (#0f172a) primary, Slate (#64748b) secondary

**Section Structure:**

1. **Section Header (centered):**
   - Purple eyebrow pill: "L'EXPÉRIENCE QALEM"
   - Headline (40px, bold): "Une vraie classe, pas un monologue"
   - Subtext (18px, gray): "6 agents IA avec des personnalités distinctes qui enseignent, questionnent, plaisantent et prennent des notes — exactement comme dans une salle de cours vivante."

2. **Main Visual (full width, centered):**
   - A large, detailed mockup of the Qalem roundtable view:
     - Center: current slide being presented (marketing topic)
     - Bottom: roundtable bar with 6 circular agent avatars in a row + user avatar
     - Left: chat panel showing a conversation between agents
     - Each agent has a colored ring matching their personality
   - The mockup should be in a browser chrome frame with a soft shadow
   - Subtle floating speech bubbles above 2-3 agents showing short text

3. **Agent Cards Row (6 cards, horizontal scroll on mobile):**
   Each card (200px wide, white, rounded 12px, soft shadow):
   - Circular avatar at top (48px) with colored ring
   - Agent name in bold (16px)
   - Role badge: "Enseignant" / "Assistant" / "Étudiant" in small colored pill
   - One-line description in gray (14px)

   The 6 agents:
   - 🎓 "Professeur IA" — blue ring — "Présente, explique, dessine au tableau"
   - 🤝 "Assistant Pédagogique" — green ring — "Reformule, simplifie, donne des exemples"
   - 😄 "Le Rigolo" — amber ring — "Blagues, références pop, allège l'atmosphère"
   - 🔍 "Le Curieux" — pink ring — "Pose les questions que vous n'osez pas"
   - 📝 "Le Secrétaire" — cyan ring — "Résume, structure, prend des notes"
   - 🧠 "Le Penseur" — violet ring — "Connexions profondes, devil's advocate"

4. **Quote Callout (centered, below cards):**
   - Large quotation mark icon in purple
   - Italic text (20px): "Je me suis surpris à rire pendant un cours en ligne. C'est la première fois."
   - Attribution: "— Beta testeur, Casablanca"
   - Subtle purple left border accent
```

---

## PROMPT 3 — Section "Voix Naturelles Trilingues"

```
A bold, emotional feature section about natural AI voices in French, Arabic, and Darija. This section must evoke linguistic pride and cultural respect.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Dark section (Deep Charcoal #0f172a background) for contrast
- Primary Accent: Purple (#722ed1) glowing elements
- Text: White (#f8fafc) primary, Slate (#94a3b8) secondary
- Surface: Dark cards (#1e293b) with subtle border (#334155)

**Section Structure:**

1. **Section Header (centered, white text on dark):**
   - Purple glowing eyebrow pill: "VOTRE LANGUE, VOTRE VOIX"
   - Headline (40px, bold, white): "Pas de robot. De vraies voix."
   - Subtext (18px, slate): "9 providers TTS avec des voix qui sonnent humaines — en français, en arabe, et même en darija marocaine."

2. **Voice Demo Cards (3 cards, horizontal, centered):**
   Each card (360px wide, dark surface, rounded 16px, purple glow on hover):

   **Card 1 — Français:**
   - Small French flag dot + "Français" label
   - Audio waveform visualization (animated, purple gradient)
   - Play button (circle, white, centered on waveform)
   - Voice name: "Charlotte — ElevenLabs" in white
   - Description (14px, slate): "Voix professionnelle, claire et chaleureuse"
   - Quality badge: "9/10 Naturalité" in green pill

   **Card 2 — العربية:**
   - Moroccan flag dot + "العربية" label (right-aligned for RTL feel)
   - Audio waveform (animated, emerald gradient)
   - Play button
   - Voice name: "Ghizlane — Darija" in white
   - Description: "صوت طبيعي بالدارجة المغربية"
   - Quality badge: "7.5/10" + special badge "🇲🇦 Darija"

   **Card 3 — English:**
   - UK/US flag dot + "English"
   - Audio waveform (animated, blue gradient)
   - Play button
   - Voice name: "James — Fish Audio S2"
   - Description: "Professional, warm, conversational"
   - Quality badge: "9/10 Naturalité"

3. **Provider Logos Row (below cards):**
   - "Propulsé par" label in slate
   - Logos (white/muted): ElevenLabs, Fish Audio, Cartesia, Azure, OpenAI
   - Spaced evenly, small (24px height)

4. **Latency Stat (centered, below logos):**
   - Large number "40ms" in purple glow
   - Label: "Latence Cartesia Sonic 3 — conversation en temps réel"
```

---

## PROMPT 4 — Section "Répétition Espacée FSRS"

```
A data-driven, visually compelling section about spaced repetition and the forgetting curve. Use graphs and animations to make the science tangible.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, clean, scientific feel
- Background: White (#ffffff)
- Primary Accent: Purple (#722ed1)
- Secondary: Emerald (#059669) for success/improvement
- Danger: Red (#ef4444) for the forgetting curve

**Section Structure:**

1. **Section Header (centered):**
   - Purple eyebrow: "RÉTENTION INTELLIGENTE"
   - Headline (40px): "Vous n'oublierez plus jamais"
   - Subtext (18px): "L'algorithme FSRS-5 calcule le moment optimal pour chaque révision. 3 minutes par jour suffisent pour une rétention de 90%."

2. **Forgetting Curve Graph (left 55%):**
   - Elegant line chart showing two curves:
     - Red dotted line: "Sans révision" — drops from 100% to 30% over 30 days (steep decay)
     - Green solid line: "Avec FSRS" — stays at 85-90% with small dips and recovery at review points
   - Review points marked with small green dots on the green curve
   - Y-axis: "Rétention %" (0-100)
   - X-axis: "Jours" (0-30)
   - Large stat overlay: "90% vs 30%" in the gap between curves
   - Soft grid lines, clean axes, no chart junk

3. **Review Card Mockup (right 45%):**
   - A phone mockup (iPhone frame) showing the review interface:
     - Card showing a quiz question: "Quelle est la différence entre FOB et CIF ?"
     - Below: "Voir la réponse" button
     - At bottom: 4 rating buttons in a row: "Encore" (red), "Difficile" (orange), "Bien" (green), "Facile" (blue)
     - Progress bar at top: "3/12 cartes"
   - Below the phone: WhatsApp notification mockup
     - Green WhatsApp bubble: "🧠 Qalem — 5 cartes à réviser (2 min)"

4. **Stats Row (3 items, below, centered):**
   - "FSRS-5" with brain icon — "L'algorithme d'Anki, intégré"
   - "3 min/jour" with clock icon — "C'est tout ce qu'il faut"
   - "Push + Email + WhatsApp" with bell icon — "On vous rappelle"
```

---

## PROMPT 5 — Section "Pour les Institutions"

```
A trust-building section targeting institutional buyers (OFPPT, universities, training centers). Must feel enterprise-grade, serious, and reassuring.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, corporate, trustworthy
- Background: Soft Gray (#f8fafc)
- Primary Accent: Purple (#722ed1)
- Surface: White cards with subtle shadow
- Trust elements: Blue (#2563eb) for enterprise badges

**Section Structure:**

1. **Section Header (centered):**
   - Blue enterprise eyebrow: "POUR LES INSTITUTIONS"
   - Headline (40px): "Conçu pour les centres de formation et universités"
   - Subtext: "LTI 1.3, organisations multi-tenant, reporting pour les accréditations, et souveraineté des données — tout ce dont votre institution a besoin."

2. **Three Feature Columns (equal width, side by side):**

   **Column 1 — Intégration LMS:**
   - Icon: puzzle piece connecting
   - Title (20px, bold): "S'intègre dans Moodle en 10 minutes"
   - Description: "LTI 1.3 compatible avec tous les LMS. Les notes remontent automatiquement au carnet de notes. Zéro changement de workflow."
   - Visual: Small mockup showing a Qalem course INSIDE a Moodle interface
   - Badge: "LTI 1.3 Certified"

   **Column 2 — Organisations:**
   - Icon: building with people
   - Title: "Gérez formateurs et apprenants"
   - Description: "4 rôles (Admin, Manager, Formateur, Apprenant), bibliothèque partagée, templates par secteur, invitation par email."
   - Visual: Mini dashboard showing member list with role badges
   - Badge: "Multi-tenant"

   **Column 3 — Reporting:**
   - Icon: chart trending up
   - Title: "Rapports prêts pour les audits"
   - Description: "Métriques par apprenant et par formation. Export PDF et CSV. Taux de complétion, scores moyens, temps passé."
   - Visual: Mini chart/table showing metrics
   - Badge: "Kirkpatrick L1-L4"

3. **Data Sovereignty Callout (full width, below columns):**
   - Dark card (#0f172a) spanning full width
   - Left side: Server icon with Moroccan flag + shield icon
   - Center text (white):
     - Headline: "Vos données restent chez vous"
     - Body: "100% auto-hébergé via Docker. Conforme CNDP et RGPD. Déployé en 15 minutes sur vos serveurs."
   - Right side: Two compliance badges "CNDP ✓" and "RGPD ✓" in green pills
   - Comparison table (small):
     - "Coursera ❌ Cloud US" | "Khan Academy ❌ Cloud US" | "Qalem ✅ Vos serveurs"
```

---

## PROMPT 6 — Section "Fonctionnalités Avancées" (Grille)

```
A dense but elegant feature grid showing 8 advanced capabilities. Each feature is a compact card with an icon, title, and one-liner. This section shows depth without overwhelming.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, clean
- Background: White (#ffffff)
- Primary Accent: Purple (#722ed1) for icons
- Surface: Soft gray (#f8fafc) cards with subtle hover elevation
- Radius: 16px for cards

**Section Structure:**

1. **Section Header (centered):**
   - Purple eyebrow: "ET BIEN PLUS ENCORE"
   - Headline (40px): "Chaque détail compte"

2. **Feature Grid (4 columns × 2 rows, 8 cards):**
   Each card (white-to-gray gradient on hover, 16px radius, padding 24px):
   - Purple icon (32px) at top
   - Title (18px, bold, near-black)
   - Description (14px, gray, 2 lines max)

   **Row 1:**
   - 🎯 "Hub MCP" — "Connectez NotebookLM, Notion, Google Drive. Vos sources enrichissent le cours."
   - 🧪 "Lab Simulation 3D" — "Physique interactive avec Three.js. L'apprenant manipule les paramètres en temps réel."
   - 💻 "Code Sandbox" — "Éditeur Monaco + exécution Python/JS dans le navigateur. Tests automatiques."
   - 🏆 "Certificats Vérifiables" — "QR code unique, vérifiable publiquement. Partageable sur LinkedIn."

   **Row 2:**
   - 📱 "Mode Hors-Ligne" — "PWA avec sync automatique. Révisez dans le bus sans internet."
   - 💳 "Paiement Mobile" — "Orange Money, Wave, CinetPay. Pas de carte bancaire requise."
   - 🤖 "Agent Bazaar" — "Marketplace d'agents pédagogiques. Importez les mieux notés en 1 clic."
   - 📊 "Pedagogy Genome" — "L'IA apprend à enseigner. Plus vous l'utilisez, meilleur il devient."

3. **Skills Showcase (below grid, centered):**
   - Small label: "Skills spécialisés inclus"
   - 4 horizontal pills:
     - "🏥 Formation Médicale"
     - "⚖️ Moot Court Juridique"
     - "💻 Coding Workshop"
     - "📐 Formation Design Pro (ADDIE/Bloom/Kirkpatrick)"
```

---

## PROMPT 7 — Section "Pricing" + CTA Final

```
A clean, persuasive pricing section followed by a powerful final call-to-action. The pricing must address the North African market (MAD, not USD).

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light with purple accent for the recommended plan
- Background: Soft Gray (#f8fafc) for pricing, gradient Purple-to-Indigo for final CTA
- Cards: White with shadow, the "Pro" card has purple border and "Recommandé" badge

**Section Structure:**

1. **Section Header (centered):**
   - Headline (40px): "Commencez gratuitement"
   - Subtext: "Open-source et auto-hébergé. Payez uniquement pour le support et les fonctionnalités premium."

2. **Pricing Cards (3 columns, centered):**

   **Card 1 — Gratuit:**
   - Gray header
   - Price: "0 MAD" large + "/mois" small
   - Subtitle: "Pour les formateurs indépendants"
   - Features list (checkmarks):
     - ✓ Auto-hébergé (Docker)
     - ✓ Cours illimités
     - ✓ 3 langues (FR/AR/EN)
     - ✓ 9 providers TTS
     - ✓ Répétition espacée FSRS
     - ✓ Export PPTX
   - CTA button: "Installer" — ghost style, gray

   **Card 2 — Professionnel (HIGHLIGHTED):**
   - Purple border, "Recommandé" badge at top
   - Price: "3 000 MAD" large + "/mois" small
   - Subtitle: "Pour les centres de formation"
   - Features list:
     - ✓ Tout du plan Gratuit
     - ✓ 5 formateurs inclus
     - ✓ 100 apprenants
     - ✓ Support email
     - ✓ Mises à jour prioritaires
     - ✓ Templates sectoriels
   - CTA button: "Essai 30 jours" — solid purple, prominent

   **Card 3 — Institution:**
   - Dark header (#0f172a)
   - Price: "Sur devis"
   - Subtitle: "Pour les universités et l'OFPPT"
   - Features list:
     - ✓ Tout du plan Pro
     - ✓ Formateurs illimités
     - ✓ LTI 1.3 + SSO
     - ✓ Reporting accréditations
     - ✓ Support WhatsApp dédié
     - ✓ Formation sur site
     - ✓ SLA 99.5%
   - CTA button: "Nous contacter" — dark solid

3. **Final CTA Section (full width, gradient background):**
   - Background: Purple (#722ed1) to Indigo (#4f46e5) gradient
   - Large headline (48px, white, centered): "Prêt à transformer votre formation ?"
   - Subtext (20px, white/80%): "Déployez Qalem en 15 minutes. Créez votre premier cours en 5 minutes de plus."
   - Two buttons centered:
     - "Essayer la Démo" — white background, purple text, large
     - "Guide d'Installation" — ghost, white border
   - Below: "Open-source • Auto-hébergé • CNDP Compliant" in white/60% small text
```

---

## PROMPT 8 — Footer

```
A comprehensive, professional footer for the Qalem platform. Must include navigation, social links, language selector, and legal compliance.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Dark (#0f172a background)
- Text: White (#f8fafc) for headings, Slate (#94a3b8) for links
- Accent: Purple (#722ed1) for hover states
- Border: (#1e293b) for dividers

**Footer Structure:**

1. **Main Footer Grid (4 columns):**

   **Column 1 — Brand:**
   - Qalem logo (white)
   - One-line: "Classe interactive IA — Open Source"
   - Social icons row: GitHub, Discord, LinkedIn, Twitter/X
   - Language selector: FR | AR | EN pills

   **Column 2 — Produit:**
   - Fonctionnalités
   - Pricing
   - Démo Live
   - Guide d'Installation
   - Documentation API

   **Column 3 — Institutions:**
   - Intégration LMS
   - Organisations
   - Reporting
   - Contacter l'Équipe
   - Pilote Gratuit

   **Column 4 — Ressources:**
   - GitHub (Open Source)
   - Guide du Formateur
   - Guide de l'Apprenant
   - Blog
   - FAQ

2. **Bottom Bar (full width, border-top):**
   - Left: "© 2026 Qalem. Licence AGPL-3.0"
   - Center: "Conçu pour le Maroc et l'Afrique 🇲🇦"
   - Right: "Politique de confidentialité • Conditions d'utilisation • CNDP"
```

---

## NOTES POUR L'EXÉCUTION

### Ordre recommandé dans Stitch

1. Prompt 0 (Design System) — comme référence, pas à générer
2. Prompt 1 (Nav + Hero) — la première impression
3. Prompt 2 (Multi-Agents) — le "wow" factor
4. Prompt 3 (Voix) — l'émotion culturelle
5. Prompt 4 (FSRS) — la preuve scientifique
6. Prompt 5 (Institutions) — la confiance enterprise
7. Prompt 6 (Grille avancée) — la profondeur
8. Prompt 7 (Pricing + CTA) — la conversion
9. Prompt 8 (Footer) — la crédibilité

### Pour chaque prompt

- Copier le bloc **DESIGN SYSTEM** du Prompt 0 dans chaque prompt pour la cohérence
- Si Stitch génère une section trop chargée, demander : "Simplify this section — more whitespace, fewer elements"
- Pour la version arabe : ajouter "Mirror this layout for RTL Arabic. Use Noto Sans Arabic font. Right-align all text."
- Pour le dark mode : ajouter "Create a dark variant using Deep Charcoal (#0f172a) background with purple glow accents"

### Micro-interactions à mentionner

Ajouter à chaque prompt si Stitch supporte les animations :
- "Fade-up on scroll for each element (staggered 100ms delay)"
- "Subtle hover: card lifts 4px with expanded shadow"
- "Number counter animation on scroll into view"
- "Waveform pulses gently when idle, speeds up on hover"
