# kanithanj.cv

Apply-CV PDF maker. Lives in this collab-finder tree (`vendor/kanithanj-cv`). That tree is the source of truth. Install copies it to `~/.local/share/kanithanj.cv` and puts `kanithanj.cv` on `PATH`.

`generate` is the only write. It never mutates the site master `cvdata.json`.

## How to use

### 1. Install once

Needs [bun](https://bun.sh).

```bash
# From a collab-finder checkout
scripts/install-kanithanj-cv.sh

# From any machine (no sibling repos)
curl -fsSL https://raw.githubusercontent.com/p10ns11y/collab-finder/main/scripts/install-kanithanj-cv.sh | bash
```

Or **Preferences → Install kanithanj.cv** in kanithanj.ai.

First install pulls master facts from GitHub into `~/.config/kanithanj.cv/cvdata.json` and points the install home at that file.

```bash
kanithanj.cv --help
kanithanj.cv status
```

`status` should show `cvdata: config ~/.config/kanithanj.cv/cvdata.json` (or `env` if you set `CVDATA_SRC`).

### 2. Daily apply

Packs come from kanithanj.ai (**Prepare → Generate apply CV** / export). They live under `~/.local/share/collab-finder/application_packs/`.

```bash
kanithanj.cv list
kanithanj.cv generate xai-exceptional-software-engineer-2026-07-17
kanithanj.cv open last
```

Bare `kanithanj.cv` lists packs. On a TTY it also picks a number and generates. `kanithanj.ai` still calls `kanithanj.cv <pack>`.

A pack ref can be the folder slug, `opp_17`, or a numeric id.

Outputs:

```text
~/.local/share/kanithanj.cv/out/apply/{name}-{role}-{id}.pdf
~/.local/share/kanithanj.cv/out/apply/<pack-slug>/{name}-{role}-{id}.pdf
<pack>/submit/{name}-{role}-{id}.pdf   # when submit/ exists
```

Master-only PDF (no overlay):

```bash
kanithanj.cv generate --master
```

### 3. Refresh facts after you edit the site

Edit `src/data/cvdata.json` in [p10ns11y/devprofile](https://github.com/p10ns11y/devprofile), push, then:

```bash
kanithanj.cv sync
```

That re-runs the installer and pulls GitHub `src/data/cvdata.json` into `~/.config/kanithanj.cv/cvdata.json`. There is no local file-watcher and no hook on `pnpm generate-pdf`. Sync is the trigger.

### 4. Upload a file instead

Write `~/.config/kanithanj.cv/cvdata.json` yourself. Then skip the remote overwrite:

```bash
KANITHANJ_CVDATA_SYNC=0 kanithanj.cv sync
```

`CVDATA_SRC=/path/to/cvdata.json` still wins when set (one-off override, including Preferences Install if a checkout path is saved).

## Commands

```text
kanithanj.cv                 list packs; TTY also picks and generates
kanithanj.cv list
kanithanj.cv status
kanithanj.cv open [pack|last]
kanithanj.cv link            symlink XDG packs into this home
kanithanj.cv sync            refresh CLI + facts from the recorded remote (or local vendor)
kanithanj.cv generate [pack] write PDF (master if omitted)
kanithanj.cv <pack|opp_N>    generate (kanithanj.ai still calls this)
kanithanj.cv generate <pack> --no-submit-copy
```

## Packs

Resolve in this order:

1. `COLLAB_FINDER_PACKS`
2. `$XDG_DATA_HOME/collab-finder/application_packs`
3. `./application_packs` if it exists

Folder slug: `{company}-{title}-{YYYY-MM-DD}`. Overlay is `cv-overlay.json` in the pack. Without it the PDF matches master facts.

## Master facts

| Source | When |
|--------|------|
| `CVDATA_SRC` | env override |
| `~/.config/kanithanj.cv/cvdata.json` | installed default (GitHub pull or your upload) |
| install-home `src/data/cvdata.json` | symlink to one of the above |

The site repo owns the published JSON. The CLI owns a copy you refresh on purpose.

## Look (maintainers)

PDF look files (`cv-document.tsx` and the four lib helpers) are pulled from `p10ns11y/devprofile` with `scripts/pull-cv-renderer.sh`. That script copies an allowlist only. It does not copy the CLI writer.

```bash
# After a visual change is on GitHub
KANITHANJ_RENDER_REF=main scripts/pull-cv-renderer.sh
# commit vendor, then
kanithanj.cv sync
```

## Env

| Variable | Role |
|----------|------|
| `CVDATA_SRC` | exact `cvdata.json` path (wins) |
| `KANITHANJ_CVDATA_SYNC=0` | `sync` / `--sync` skips the GitHub facts pull |
| `KANITHANJ_CVDATA_REF` | git ref for the facts pull (default `main`) |
| `KANITHANJ_CV_REF` | git ref when installing from GitHub |
| `COLLAB_FINDER_PACKS` | packs root override |
| `KANITHANJ_CV_HOME` | install destination (default `~/.local/share/kanithanj.cv`) |
