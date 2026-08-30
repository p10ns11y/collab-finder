# kanithanj.cv

Apply-CV PDF maker. Lives in this collab-finder tree (`vendor/kanithanj-cv`). That tree is the source of truth. Install copies it to `~/.local/share/kanithanj.cv`.

```bash
# From a collab-finder checkout
scripts/install-kanithanj-cv.sh

# From any machine (no sibling repos)
curl -fsSL https://raw.githubusercontent.com/p10ns11y/collab-finder/main/scripts/install-kanithanj-cv.sh | bash
```

```text
kanithanj.cv                 list packs; TTY also picks and generates
kanithanj.cv list
kanithanj.cv status
kanithanj.cv open [pack|last]
kanithanj.cv link            symlink XDG packs into this home
kanithanj.cv sync            pull the recorded remote or vendor tree
kanithanj.cv generate [pack] write PDF (only write)
kanithanj.cv <pack|opp_N>    generate (kanithanj.ai still calls this)
```

Packs resolve in this order:

1. `COLLAB_FINDER_PACKS`
2. `$XDG_DATA_HOME/collab-finder/application_packs`
3. `./application_packs` if it exists

Master cvdata is an operator file at `~/.config/kanithanj.cv/cvdata.json`.

- First install pulls `src/data/cvdata.json` from `p10ns11y/devprofile` (GitHub).
- `kanithanj.cv sync` refreshes that file from GitHub. Edit facts on the site, push, then sync. No local hook.
- Upload: write that config file yourself. Set `KANITHANJ_CVDATA_SYNC=0` so sync does not overwrite it.
- `CVDATA_SRC` still wins when set.

`kanithanj.cv sync` re-runs the installer from the recorded remote, or from the local vendor path when that checkout still exists.

Look files (`cv-document.tsx` and the four lib helpers) are pulled from `p10ns11y/devprofile` with `scripts/pull-cv-renderer.sh`. That script copies an allowlist only. It does not copy the CLI writer.
