---
name: select-apply-specific-projects
description: compare featured projects against target apply pack (xAI) and update overlay to include only relevant ones like collab-finder, elomaxz, adaptate
---

# select-apply-specific-projects

## When to use

compare featured projects against target apply pack (xAI) and update overlay to include only relevant ones like collab-finder, elomaxz, adaptate

## Composability

- mode: `workflow`
- evidence: turns 13-14 tool_sequence

## Steps

1. read_file p10ns11y/README.md and pack
2. run_terminal_command to regenerate
3. write overlay.json

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
