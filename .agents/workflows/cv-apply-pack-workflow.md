---
name: cv-apply-pack-workflow
description: end-to-end flow from opportunity pack export through symlink, meaningful naming, tech cleanup, project selection, and final CV regeneration under out/apply/
kind: workflow
skill_chain: ["setup-application-pack-symlink", "slugify-pack-and-cv-names", "select-apply-specific-projects"]
---

# cv-apply-pack-workflow

end-to-end flow from opportunity pack export through symlink, meaningful naming, tech cleanup, project selection, and final CV regeneration under out/apply/

## Skill chain

1. `setup-application-pack-symlink`
2. `slugify-pack-and-cv-names`
3. `select-apply-specific-projects`

## Phases

### Explore

memory_search + read_file to recall prior decisions and inspect repos

### Wire

implement gitignored symlink and slug naming

### Refine

archive old tech, fix taxonomy, choose xAI-relevant projects

### Generate

run generate-apply-cv script and verify output

## Support

- sessions: 1
- rank: 29
