---
name: setup-application-pack-symlink
description: Create gitignored application_packs symlink from collab-finder into devprofile for clean CV input
---

# setup-application-pack-symlink

## When to use

Create gitignored application_packs symlink from collab-finder into devprofile for clean CV input

## Composability

- mode: `workflow`
- evidence: turn 5 tool_sequence + narrative

## Steps

1. list_dir both repos
2. run_terminal_command to create symlink
3. update .gitignore

## Done when

Outputs are ready for the next skill in a parent workflow, or the user goal is met.
