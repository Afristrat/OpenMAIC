### AI-Generated Image Requests

Use image generation only for slide scenes that need a static visual.

- Add a `mediaGenerations` entry only when a generated image genuinely enhances the content
- Every requested image must be a new explanatory illustration. Never reproduce, trace, imitate, or reuse an image from the supplied documents
- Use `type: "image"`
- Each image request specifies: `prompt` (description for the generation model), `elementId` (unique placeholder), and optionally `aspectRatio` (default "16:9") and `style`
- **Image IDs**: use `"gen_img_1"`, `"gen_img_2"`, etc. IDs are globally unique across the entire course, not reset per scene
- Build the prompt from the **single teaching idea the visual must make easier to understand**, not by copying the narration. Distil the meaning first, then describe the visual result
- Choose the explanatory form before the style: process, relationship map, comparison, timeline, system, spatial scene, or concrete object. If a native table or chart would explain the content more accurately, use that slide element instead of rasterising it as an image
- Never add a decorative person, generic crossed-arms presenter, stock-photo posture, or irrelevant scenery. A person is justified only when their visible action is the concept being taught
- State the intended composition, focal hierarchy, safe margins, and aspect ratio. Use the golden ratio only when it improves an illustration's focal hierarchy; structural legibility takes priority for diagrams
- Avoid text inside generated images. When labels are indispensable, limit them to at most five short labels and require large, legible lettering. Never ask the image model to reproduce paragraphs, tables of figures, hex codes, URLs, citations, or detailed instructions
- Add negative constraints against likely defects: tiny or garbled text, decorative people, watermark, invented logo, clutter, cropped content, duplicated objects, and irrelevant details
- **Language in images**: If the image contains text, labels, or annotations, the prompt must explicitly specify that all text in the image should be in the course language (for example, "all labels in Chinese" for zh-CN courses, "all labels in English" for en-US courses). For purely visual images without text, language does not matter
- **Avoid duplicate images across slides**: Each generated image must be visually distinct. Do not request near-identical images for different slides. If multiple slides cover the same topic, vary the visual angle, scope, or style
- **Cross-scene reuse**: To reuse a generated image in a different scene, reference the same `elementId` in the later scene's content without adding a new `mediaGenerations` entry. Only the scene that first defines the `elementId` in its `mediaGenerations` should include the generation request
- Use generated images for static content: explanatory illustrations, spatial scenes, meaningful objects, conceptual maps, or simple labelled diagrams. Use native chart and table elements for precise structured data

Image example:

```json
"mediaGenerations": [
  {
    "type": "image",
    "prompt": "A new original diagram showing the water cycle with evaporation, condensation, and precipitation arrows; do not reproduce any supplied image",
    "elementId": "gen_img_1",
    "aspectRatio": "16:9"
  }
]
```
