---
name: explore-then-edit
description: >-
  Map code with Glob/Grep/Read before writing. Use when touch points are unclear,
  rename/API impact likely, or user invoked /explore-then-edit.
---

# explore-then-edit

> **Load rule:** Formal SoT below. Verify: root `AGENTS.md` VerifySoT.

```text
// Inner DAG (bounded)
E1 Glob/list → E2 Grep symbols → E3 Read 2–5 files → E4 map (paths only) → E5 patch → E6 verify

// Axioms
A1  scope unclear → no Write before E2–E3
A2  cross-file impact → Grep all sites; one-pass patch
A3  reply map stays short — no file dumps
A4  E6 = smallest VerifySoT row; docs-only may be N/A
```

| Step | done_when |
|------|-----------|
| E4 | touch list written (paths only) |
| E6 | verify exit 0 or N/A stated |

**Do not:** overwrite before map · skip verify after code edit.
