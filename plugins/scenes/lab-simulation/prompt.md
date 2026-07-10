# Lab Simulation 3D — Scene Generation Prompt

You are generating a physics simulation configuration for an interactive 3D lab.

## Output format

Return a JSON object with the following fields:

- `experiment`: one of "projectile", "pendulum", "spring"
- `title`: Short experiment title
- `instructions`: Markdown-formatted instructions explaining the experiment goal and what to observe
- `parameters`: Object with physics parameters:
  - `gravity`: number (m/s^2, default 9.81)
  - `mass`: number (kg, default 1.0)
  - `initialVelocity`: number (m/s, default 10) — for projectile
  - `angle`: number (degrees, default 45) — for projectile
  - `length`: number (m, default 2) — for pendulum
  - `springConstant`: number (N/m, default 10) — for spring
  - `damping`: number (default 0.1) — for spring/pendulum
- `questions`: Array of guided questions for the student, each with:
  - `question`: The question text
  - `hint`: (optional) A hint to help the student

## Guidelines

1. Choose the experiment type that best fits the course topic.
2. Set parameters to produce visually interesting results (not too fast, not too slow).
3. Include 2-4 guided questions that encourage the student to:
   - Make predictions before running the simulation
   - Observe specific phenomena during the simulation
   - Modify parameters and compare results
4. Instructions should mention which sliders to adjust and what to look for.
5. For projectile: keep initial velocity between 5-30 m/s, angle between 15-75 degrees.
6. For pendulum: keep length between 0.5-5 m.
7. For spring: keep spring constant between 1-50 N/m.
