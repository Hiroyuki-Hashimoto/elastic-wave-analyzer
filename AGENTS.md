# AGENTS.md

## Persistent development rules

- Read this AGENTS.md before making changes.
- The repository is public (GitHub Pages); never commit secrets, keys, or personal data.
- Do not run git push unless the user explicitly asks.
- When the user asks to push, also publish the site: run `npm run deploy`
  (builds and force-pushes dist/ to the gh-pages branch) after the push,
  and report the result. Publishing is otherwise manual; never run
  `npm run deploy` on your own initiative.
- Commit each completed, independently verifiable feature as a separate commit.
- Before every commit, run npm run build and report the result.
- Stop after each planned implementation step and wait for user approval before starting the next step.
- Keep all user-facing UI text in English.
- Process CSV files entirely in the browser; do not send waveform data to external services.
- Do not add a backend, database, authentication, routing, global state library, UI component library, or CSS framework unless explicitly requested.
- Keep React components few and small; place waveform-processing logic in src/lib.
- Maintain the four-module boundary:
  - src/lib/importer.ts: input-format detection, column mapping, unit normalization, file reading
  - src/lib/waveform.ts: raw waveform validation, resampling, gain, offset, trim
  - src/lib/picker.ts: Start/Peak picking and STS/PTP calculations
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

[Co-Authored-By: <agent> <email>]
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

- A commit made by an AI agent carries exactly one trailer line naming
  that agent, one blank line before it. For Claude:
  `Co-Authored-By: Claude <model name> <noreply@anthropic.com>`
- A commit made by a person carries no trailer
- NEVER use `Co-Authored-By: opencode <noreply@opencode.ai>`; credit only
  the agent that actually did the work
- NEVER add banner lines like `🤖 Generated with ...`

### Example

```
style(script-runner): smaller type, more of the panel spent on the editor

Drops the editor to text-xs on an 18px line, and the Output log, API
list and language row to 0.7rem. Also tightens the panel's padding and
gaps: the editor is the column's only flex-1 child, so anything the rows
around it give up becomes editor height.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Versioning and releases

Version numbers are not semantic versioning. As with the Linux kernel,
a number only tells which release is newer; a major bump is not a
compatibility statement, just a sign the minor number grew too large.

- Format: `MAJOR.MINOR.PATCH`, starting at 1.0.0.
- Small fixes bump PATCH (7.1.2 -> 7.1.3), like a Linux stable release.
- Regular feature additions bump MINOR and reset PATCH to 0
  (7.1.3 -> 7.2.0), like a Linux mainline release.
- When MINOR would reach 20, bump MAJOR instead (7.19.x -> 8.0.0).
- Bump the version per release, not per commit: a release groups
  several commits. Release only when the user asks.
- Release steps:
  1. `npm version X.Y.Z --no-git-tag-version` (updates package.json
     and package-lock.json; the app shows this version in its header)
  2. `npm run build`, then commit as
     `chore(release): bump version to X.Y.Z`
  3. `git tag -a vX.Y.Z -m "vX.Y.Z"`
  4. Push main and the tag, then run `npm run deploy`
  5. `gh release create vX.Y.Z` with bilingual notes (see below)
     summarizing the changes since the previous tag

### Release notes

- Write every release note in English and Japanese: each paragraph or
  bullet in English, followed by its Japanese version.
- Keep it about the size of v1.0.1: one or two sentences of summary
  plus one bullet per user-visible change, one or two lines each —
  roughly 100 English words at most, with the Japanese matching.
- Say what changed for the user. Leave root causes, measurements and
  implementation details to the commit messages.
- Skip boilerplate such as the PWA reload note unless the release
  makes it necessary.
