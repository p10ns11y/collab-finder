# Typst pin

kanithanj.cv renders apply and site CVs with the official Typst CLI, not react-pdf.

## Tested with

- Typst **0.13.1** (`8ace67d9`)
- Date: **25 November 2026**, Europe/Stockholm
- Fonts: Charter TTFs in `typst/fonts/` (hashes in NOTICE)
- Official binary SHA-256 matches the box install used for the apply-pack PDF

## Official archives (no npm typst wrapper)

Downloaded from `https://github.com/typst/typst/releases/download/v0.13.1/`.
Sizes match the GitHub release assets. SHA-256 computed from those URLs on 25 Nov 2026:

| Archive | SHA-256 | Bytes |
|---|---|---|
| typst-x86_64-unknown-linux-musl.tar.xz | `7d214bfeffc2e585dc422d1a09d2b144969421281e8c7f5d784b65fc69b5673f` | 13608296 |
| typst-aarch64-unknown-linux-musl.tar.xz | `4f5b7ee6e57fb639019ee0f6bffcf940edad228ede6ff5269a9f05a1544ceed4` | 12888772 |

The npm packages `typst@0.10.x` and `typst-cli@1.0.0` were not used (`typst-cli` is a 223-byte stub; 0.10 would not match 0.13.1 layout).

`scripts/ensure-typst.ts` downloads the archive for the current Linux arch, verifies SHA-256, and extracts the binary. Override with `TYPST_BIN` if a same-version binary is already on PATH.

Vercel/CI need outbound HTTPS to GitHub Releases (public, no token). If a build environment blocks that, vendor the verified tarball in this package or fail the build; do not add secrets.
