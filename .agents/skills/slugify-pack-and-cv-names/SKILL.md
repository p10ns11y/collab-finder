---
name: slugify-pack-and-cv-names
description: replace generic opp_N names with company-title-date slugs for both pack folders and output CV filenames
---

# slugify-pack-and-cv-names

## When to use

replace generic opp_N names with company-title-date slugs for both pack folders and output CV filenames

## Composability

- mode: `workflow`
- evidence: turn 7 tool calls and narrative

## Steps

1. grep for current naming
2. read_file manifest.json
3. search_replace to implement slug logic with fallbacks

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
