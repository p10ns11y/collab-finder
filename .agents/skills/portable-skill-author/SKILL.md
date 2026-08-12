---
name: portable-skill-author
description: >
  Author a SKILL.md that works as a Cursor skill and a Grok slash command
  (/skill-name). Use when creating or porting a frequent workflow skill across
  agents, or when the user runs /portable-skill-author or /create-skill for
  multi-agent install.
---

# Portable skill author

## When to use

- User wants a reusable workflow skill for Cursor and/or Grok Build
- Porting an existing procedure into `SKILL.md`
- Skill should appear as `/name` in Grok and attachable in Cursor

## Steps

1. Confirm the workflow is **frequent** (weekly+) — otherwise write a one-line note, not a skill.
2. Pick a kebab-case `name` (slash command = `/name`).
3. Write frontmatter:
   - `name`
   - `description` — third person; include trigger phrases and `/name`
4. Body sections: **When to use**, **Steps** (tool-friendly), **Done when**, optional **Do not**.
5. Install locations (prefer one canonical copy + symlink if needed):
   - Cross-agent frequent: `~/.grok/skills/<name>/SKILL.md` and `~/.cursor/skills/<name>/` or `~/.agents/skills/<name>/`
   - Project-only: `<repo>/.agents/skills/<name>/` or `<repo>/.grok/skills/<name>/`
6. Do **not** hardcode `/home/…` paths — use `~` or `{REPO_ROOT}`.

## Done when

Skill file exists with triggers in `description`, and user can invoke `/name` (Grok) or attach the skill (Cursor) on the next matching task.
