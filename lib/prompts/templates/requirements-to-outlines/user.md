Please generate scene outlines based on the following course requirements.

---

## User Requirements

{{requirement}}

---

{{userProfile}}

## Language Context

Infer the course language directive by applying the decision rules from the system prompt. Key reminders:
- Requirement language = teaching language (unless overridden by explicit request or learner context)
- Foreign language learning → teach in user's native language, not the target language
- PDF language does NOT override teaching language — translate/explain document content instead

---

## Reference Materials

### Source hierarchy

- When an author attaches a document and asks for a course based on that content, the attached document is the primary source and determines the course's concepts, sequence, examples, qualifications, and conclusions.
- Web results are secondary. Use them only to update, verify, localize, or clarify the primary source. They must never silently replace or dilute it.
- If a web result conflicts with the attached document, preserve the document's position and make the conflict explicit for the author.
- Cover the whole supplied extract, including its conclusion. Do not infer that an omitted section is absent from the original document.
- Source-image descriptions are analysis context only. Never request their reuse in a scene; create a new original illustration when a visual is pedagogically useful.

### PDF Content Summary

{{pdfContent}}

### Source image descriptions — context only, never reusable

{{availableImages}}

### Web Search Results

{{researchContext}}

{{teacherContext}}

{{#if hasPlugins}}
---

## Available Scene Plug-ins

{{availablePlugins}}

---
{{/if}}

## Output Requirements

Please automatically infer the following from user requirements:

- Course topic and core content
- Target audience and difficulty level
- Course duration (default 15-30 minutes if not specified)
- Teaching style (formal/casual/interactive/academic)
- Visual style (minimal/colorful/professional/playful)

Then output your response as a single JSON object.

**Top-level shape — this is what you MUST return:**

```json
{
  "languageDirective": "2-5 sentence instruction describing the course language behavior",
  "courseTitle": "concise course name, ≤30 chars, in the teaching language",
{{#if designSystemEnabled}}
  "designDirective": {
    "version": 1,
    "source": "derived",
    "tone": "sober",
    "density": "balanced",
    "seed": { "hueFamily": "blue", "chromaLevel": "low" },
    "palette": null,
    "typography": { "heading": "Inter", "body": "Open Sans", "scaleShift": 0 },
    "grid": { "margin": 72 },
    "shapes": { "radius": 12, "stroke": "none" },
    "surfacePlan": { "content": "base", "engagement": "tint", "punchline": "none" },
    "accentSequence": "primary-then-achievement | primary-only",
    "forbidden": [],
    "notes": ""
  },
{{/if}}
  "syllabus": {
    "audience": "target participants",
    "prerequisites": "verified prerequisites or an explicit author-confirmation placeholder",
    "overallObjective": "observable overall performance",
    "learningObjectives": ["observable objective 1", "observable objective 2"],
    "totalDurationMinutes": 45,
    "deliveryMode": "delivery format",
    "assessmentStrategy": "how performance will be evidenced",
    "expectedDeliverable": "usable output produced by the learner"
  },
  "outlines": [ /* array of scene objects, schema described below */ ]
}
```

Never return a bare array. Never omit `languageDirective`, `courseTitle`, or `syllabus`. All four keys are required. Do not invent missing audience or prerequisites: write an explicit author-confirmation placeholder in the teaching language.
{{#if designSystemEnabled}}
The design-system flag is enabled: include `designDirective` as a fifth top-level key between `courseTitle` and `syllabus`, following the schema above.
{{/if}}

**Each scene inside the `outlines` array has this minimum shape:**

```json
{
  "id": "scene_1",
  "type": "slide" | "quiz" | "interactive" | "pbl" | "plugin",
  "title": "Scene Title",
  "description": "Teaching purpose description",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "order": 1
}
```

### Special Notes

- **quiz scenes must include quizConfig**:
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
- **Interactive scenes**: If a concept benefits from hands-on simulation/visualization, use `"type": "interactive"` with `widgetType` and `widgetOutline` fields. Limit to 1-2 per course.
   - Select widgetType based on concept: simulation (physics/chem), diagram (processes), code (programming), game (practice), visualization3d (3D models)
   - Provide appropriate widgetOutline for the widget type
{{#if hasPlugins}}
- **Plug-in scenes**: Use `"type": "plugin"` only when one of the registered plug-ins above is a precise pedagogical fit. Include its exact `"pluginType"` value. Never invent a plug-in identifier. Prefer a plug-in over generic interactive HTML when the registered capability directly matches the exercise.
{{/if}}
- **Scene count**: Based on inferred duration, typically 1-2 scenes per minute
- **Quiz placement**: Recommend inserting a quiz every 3-5 slides for assessment
- **Language**: Infer from the user's requirement text and context, then output all content in the inferred language
- **If web search results are provided**, reference specific findings and sources in scene descriptions and keyPoints. The search results provide up-to-date information — incorporate it to make the course content current and accurate.

{{#if designSystemEnabled}}
### Design direction

Choose `designDirective` once for the whole course from these closed enums: tone = `sober`, `warm`, `energetic`, `technical` or `editorial`; density = `compact`, `balanced` or `airy`; hue family = `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `indigo`, `violet`, `magenta` or `neutral`; chroma = `low` or `mid`; font = `Inter`, `Roboto`, `Open Sans`, `Montserrat`, `Source Sans 3`, `Merriweather`, `Literata`, `Source Serif 4` or `JetBrains Mono`; content surface = `base` or `tint`; engagement surface = `dark` or `tint`; punchline = `gradient`, `solid` or `none`; accent sequence = `primary-then-achievement` or `primary-only`; stroke = `none` or `hairline`. `grid.margin` is an integer from 64 to 80; `shapes.radius` is an integer from 0 to 24; `typography.scaleShift` is -1, 0 or 1; `forbidden` has at most three entries, each no longer than 60 characters; `notes` is no longer than 100 characters. Adapt tone, density, hue family, typography, margin and surfaces to the subject, adult audience, risk level and teaching language. Never output hex colors or add pedagogical content to this object. `palette` must be `null`.

Use these deliberately distinct starting points, not fixed templates:
- Industrial safety: sober, compact, blue, indigo or neutral hue, strong structure, no decorative gradients.
- Finance for executives: editorial, balanced, neutral or indigo hue, restrained accents and generous evidence space.
- Relational skills: warm, airy, teal or violet hue, human tone without childish decoration.

At this planning stage no tenant charter is supplied to the model, so set `source` to `derived`. Do not claim charter-derived values. Do not copy a single example's colors or composition into unrelated courses.
{{/if}}

{{#if designSystemDisabled}}
**Final reminder**: your entire response must be a JSON **object** with exactly four top-level keys: `languageDirective`, `courseTitle`, `syllabus`, and `outlines`. Do not return a bare array. Do not wrap in prose or code fences.
{{/if}}
{{#if designSystemEnabled}}
**Final reminder**: your entire response must be a JSON **object** with exactly five top-level keys: `languageDirective`, `courseTitle`, `designDirective`, `syllabus`, and `outlines`. Do not return a bare array. Do not wrap in prose or code fences.
{{/if}}
