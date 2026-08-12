---
name: explore-then-edit
description: >
  Map the relevant code with Glob/Grep/Read before writing. Use when the user asks
  to change, fix, or add behavior and the touch points are unclear, or when top
  tool sequences show Read→Grep→edit. Also for /explore-then-edit.
---

# Explore then edit

## When to use

- Request implies a change but files/symbols are unknown
- Rename, API change, or cross-file impact likely
- Session pattern: explore/map before implement

## Steps

1. **Glob** candidate paths (or `list_dir` one level).
2. **Grep** for symbols, imports, and config keys mentioned by the user.
3. **Read** the 2–5 files that will actually change.
4. Summarize touch points in one short list (paths only).
5. Edit with minimal patches (`StrReplace` / `search_replace` / ApplyPatch).
6. **Verify** with the smallest project check (see verify-before-done).

## Do not

- Write or overwrite files before a Grep/Read pass when scope is unclear
- Paste large file dumps into the reply — keep the map short
- Skip verification after the edit

## Done when

Edits match the mapped touch list and a verify command has been run (or clearly N/A for docs-only).
