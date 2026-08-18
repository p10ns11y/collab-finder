# Release (Arch binary on GitHub)

**Tag publishes. A version edit on a branch does not.**

That is the fix for “tag `v2` ≠ download”: the old flow was three manual steps (build, tag, `gh release create`) that could point at different trees. CI now builds **the commit the tag names** and attaches that file to that tag.

## Cut a release

Working tree clean, on the commit you want (usually `main` after merge):

```bash
scripts/cut-release.sh 0.2.0 --push
```

That:

1. Sets `package.json`, `src-tauri/tauri.conf.json`, `Cargo.toml` / `Cargo.lock` to `0.2.0`
2. Commits `chore: release 0.2.0`
3. Annotated-tags `v0.2.0`
4. Pushes commit + tag

GitHub Actions (`.github/workflows/release.yml`) then:

- Checks `v0.2.0` == `tauri.conf.json` version
- `tauri build --no-bundle` on Ubuntu 22.04 (WebKitGTK 4.1; runs on Arch)
- Uploads `kanithanj.ai-linux-x86_64` + `SHA256SUMS` to the GitHub Release for **that tag**

Semver tags only (`v0.2.0`). Integer tags like `v2` / `v3` are rejected so the next drift cannot hide behind a cute number.

## Local install (no GitHub)

```bash
pnpm install:local
```

## Do not

- Bare `pnpm tauri build` (AppImage / `linuxdeploy` hang)
- Replace assets on an old tag (`v2` stays historical)
- Publish from a dirty tree or a PR branch unless you mean to
