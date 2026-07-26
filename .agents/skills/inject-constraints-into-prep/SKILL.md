---
name: inject-constraints-into-prep
description: Make analyze/prep load candidate-preferences and constraints in addition to CV packet
---

# inject-constraints-into-prep

## When to use

Make analyze/prep load candidate-preferences and constraints in addition to CV packet

## Composability

- mode: `workflow`
- evidence: turn 9: todo_write + search_replace implementing dual-fit schema and constraints injection

## Steps

1. read constraints file
2. extend dual-fit builders
3. pass constraints to prompt builders

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
