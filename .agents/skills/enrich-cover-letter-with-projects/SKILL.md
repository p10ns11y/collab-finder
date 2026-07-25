---
name: enrich-cover-letter-with-projects
description: Inject focused public-projects slice (description, tags, links) into prep_opportunity_target prompt
---

# enrich-cover-letter-with-projects

## When to use

Inject focused public-projects slice (description, tags, links) into prep_opportunity_target prompt

## Composability

- mode: `workflow`
- evidence: turn 19: search_replace wiring public-projects metadata into cover-letter prompts

## Steps

1. load public-projects-focused-flatten.json
2. merge into build_prep_user_prompt
3. update cover-letter generation path

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
