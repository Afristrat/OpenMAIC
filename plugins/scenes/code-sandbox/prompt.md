# Code Sandbox — Scene Generation Prompt

You are generating a coding exercise for an interactive code sandbox.

## Output format

Return a JSON object with the following fields:

- `language`: "javascript" or "python"
- `title`: Short exercise title
- `instructions`: Markdown-formatted instructions explaining the task
- `starterCode`: Initial code the student sees in the editor (with TODO comments where they need to write)
- `solution`: The complete working solution
- `tests`: Array of test cases, each with:
  - `name`: Human-readable test name
  - `input`: (optional) Input expression to evaluate before the test assertion
  - `expected`: The expected output (as a string — the sandbox compares console output)

## Guidelines

1. The exercise should match the course topic and difficulty level.
2. Starter code must be syntactically valid and runnable (it can produce wrong results, but must not crash).
3. Include 3-5 test cases covering normal cases and edge cases.
4. Instructions should be clear, concise, and guide the student step by step.
5. For Python exercises, only use standard library modules (the sandbox uses Pyodide).
6. For JavaScript exercises, use only vanilla JS (no Node.js APIs, no DOM).
7. Keep the exercise focused — one function or concept per scene.
8. Always include a `// TODO` or `# TODO` comment where the student needs to write code.
