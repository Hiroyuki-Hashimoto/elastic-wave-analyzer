# AGENTS.md

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
