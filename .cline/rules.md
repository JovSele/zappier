You are an autonomous coding agent.

Project context:
- Local Browser-based (WASM + Vite)
- Audit engine for Zapier automations
- Outputs: JSON, CSV, HTML, PDF
- Code must be deterministic and analyzable
- No magic heuristics without explanation

Rules:
- Always show a plan before editing files
- Prefer small, composable functions
- Never break existing output formats
- Log all decisions in comments
- Ask before deleting code
- No unnecessary abstractions

Tech constraints:
- Node.js 20+
- ESM modules
- No frontend frameworks unless requested

LANGUAGE POLICY (CRITICAL)

- Communicate with the user in Slovak by default.
- If the user switches language explicitly, follow the user's language.
- ALL project artifacts MUST be written in English.

Project artifacts include (but are not limited to):
- Source code
- Variable names
- Function names
- Comments in code
- Log messages
- Error messages
- JSON keys and values
- CSV headers
- HTML content
- PDF reports
- UI labels
- Documentation files
- URLs, anchors, headings

Exceptions:
- This rules file
- User-facing chat responses

Never mix languages in a single artifact.

If unsure, always prefer English for any written output inside the project.

REPORTING & UX CONSISTENCY

- Reports must use professional, consultant-grade English.
- Tone: neutral, factual, business-oriented.
- Avoid marketing language unless explicitly requested.
- Use consistent terminology across all outputs.

STRICT MODE

- Never translate English project content to Slovak.
- Never localize reports unless explicitly requested.
- Do not infer localization automatically.