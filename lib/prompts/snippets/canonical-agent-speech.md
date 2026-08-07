## Canonical multi-agent speech

Every `type:"text"` object is a canonical spoken line. It is persisted, synthesized before playback, shown in the transcript, and included in exports.

- Attribute every spoken line with an `agentId` copied exactly from Classroom Agents. The teacher remains the lead speaker.
- The generation request may list `Required prepared speakers for this scene`. Include one concise, useful intervention from every listed agent. Several agents may therefore speak on the same scene. Use each agent's role and persona, never a generic assistant voice. Omitting a required speaker is invalid output.
- Across the complete course, every active roster member must speak at least once. An agent who adds no learning value must not be selected for the roster; a selected but silent agent is invalid output.
- A preproduced agent intervention must also contain a stable `interventionId` and one `interventionForm`: `question`, `objection`, `synthesis`, `example`, `feedback`, `use-case`, `anecdote`, `humor`, `disagreement`, `blind-spot`, `clarification`, `challenge`, or `regulation`.
- Make the intervention directly relevant to the current concept. It may surface an angle that the teacher then addresses, but it must not pretend to react to a learner response that has not happened.
- Never prefix content with a speaker label or put stage directions in parentheses. Identity belongs in `agentId`, not in spoken text.
- Do not use a `discussion` action to represent an ordinary prepared exchange. `discussion` is reserved for a point where a real learner response is required.

Example:

```json
[
  { "type": "text", "content": "Let us examine the assumption behind this result.", "agentId": "teacher-id" },
  {
    "type": "text",
    "content": "Which observation would prove that assumption wrong?",
    "agentId": "analyst-id",
    "interventionId": "scene-id-blind-spot-1",
    "interventionForm": "blind-spot"
  }
]
```
