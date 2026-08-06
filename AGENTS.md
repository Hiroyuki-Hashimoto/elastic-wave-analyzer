# AGENTS.md

## Persistent development rules

- Read this AGENTS.md before making changes.
- Keep the repository private until the user explicitly requests public release.
- Do not run git push unless the user explicitly asks.
- Commit each completed, independently verifiable feature as a separate commit.
- Before every commit, run npm run build and report the result.
- Stop after each planned implementation step and wait for user approval before starting the next step.
- Keep all user-facing UI text in English.
- Process CSV files entirely in the browser; do not send waveform data to external services.
- Do not add a backend, database, authentication, routing, global state library, UI component library, or CSS framework unless explicitly requested.
- Keep React components few and small; place waveform-processing logic in src/lib.
- Maintain the three-module boundary:
  - src/lib/waveform.ts: CSV parsing, validation, units, gain, offset, trim
  - src/lib/picker.ts: STS/PTP picking and related calculations
  - src/lib/exporter.ts: CSV and PNG export

## Code comment rules

- Write all comments in English.
- Add a 1–3 line comment at the top of each function describing its purpose.
- Add a 1-line inline comment for:
  - Branch/loop conditions (explain the intent)
  - Numeric calculations and unit conversions (explain the formula and units)
  - Library-specific APIs such as uPlot calls
- Do not comment obvious assignments or standard React/TypeScript syntax.
- Prefer explaining *why* over *what* when the code is self-explanatory.
- Keep comments concise (one line where possible, two lines maximum per block).
- Do not leave commented-out code in the final commit.

## Git Commit Rules

All commits MUST follow this format, written entirely in English:

```
<type>(<scope>): <description>

<body>

Co-Authored-By: opencode <noreply@opencode.ai>
```

### Types

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`

Scope: lowercase module name (e.g. `script-runner`); omit only if unclear.

### Subject

- 50 characters max (72 hard limit), including `<type>(<scope>):`
- Lowercase start, no trailing period, imperative mood (`drop`, not `drops`)
- State what and why; never use vague text like `update stuff`

### Body

- Required. One blank line after the subject
- Wrap every line at 72 characters (no mid-word breaks)
- Explain why, not just what; include rationale and side effects

### Footer

- Exactly one trailer line, one blank line before it:
  `Co-Authored-By: opencode <noreply@opencode.ai>`
- NEVER add banner lines like `🤖 Generated with opencode`
- NEVER change the trailer name or email

### Example

```
style(script-runner): smaller type, more of the panel spent on the editor

Drops the editor to text-xs on an 18px line, and the Output log, API
list and language row to 0.7rem. Also tightens the panel's padding and
gaps: the editor is the column's only flex-1 child, so anything the rows
around it give up becomes editor height.

Co-Authored-By: opencode <noreply@opencode.ai>
```
