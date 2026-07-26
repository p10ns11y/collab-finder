---
name: finalize-apply-cv-export
description: Generate PDF, rename with name-role-job-id, copy to devprofile/out/apply and pack submit folder
---

# finalize-apply-cv-export

## When to use

Generate PDF, rename with name-role-job-id, copy to devprofile/out/apply and pack submit folder

## Composability

- mode: `workflow`
- evidence: turn 20-22 narrative

## Steps

1. run_terminal_command generate
2. copy + rename
3. verify paths

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
