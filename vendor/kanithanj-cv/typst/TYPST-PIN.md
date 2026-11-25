# Typst pin

kanithanj.cv renders apply and site CVs with the official Typst CLI, not react-pdf. Stay on **0.13.1**. Do not switch the pin to latest because of a text-layer leak found on 0.15.1.

## Tested with

Recorded **25 November 2026**, Europe/Stockholm, Charter TTFs in `typst/fonts/` (hashes in NOTICE).

| Version | Commit | Result |
|---|---|---|
| **0.13.1** (pinned) | `8ace67d9` | Apply-pack layout. `CI/CD` written with U+2060 word joiners does **not** leak U+2060 into the `pdftotext` layer (`CI/CD`). |
| **0.15.1** (latest, not pinned) | `9dfd3a08` | Same input leaks word joiners into the text layer as `CI⁠/⁠CD` (U+2060). That is why the pin stays on 0.13.1. CI fails if the typst text layer contains U+2060. |

## Official 0.13.1 archives

Downloaded from `https://github.com/typst/typst/releases/download/v0.13.1/`. Sizes match the GitHub release assets. SHA-256 computed from those URLs on 25 Nov 2026.

| Archive | SHA-256 | Bytes | typst binary SHA-256 |
|---|---|---|---|
| typst-x86_64-unknown-linux-musl.tar.xz | `7d214bfeffc2e585dc422d1a09d2b144969421281e8c7f5d784b65fc69b5673f` | 13608296 | `61f743dccaaf7d763072ae046ad71f2303752e78d499d319043248f894602f45` |
| typst-aarch64-unknown-linux-musl.tar.xz | `4f5b7ee6e57fb639019ee0f6bffcf940edad228ede6ff5269a9f05a1544ceed4` | 12888772 | `ce3c5ddac1e47bd75d9a8cc0c7620158873e70719fdfc1673beb1da474ab2e95` |
| typst-x86_64-apple-darwin.tar.xz | `4dabfe647f7f01ed9cc13ad8196a6c7f5e16f0732821b522d50740d3a9f5207b` | 11789644 | `c8d4f613159ac9d2d180f64a857df2d37ce008c0f1751fee82352a829af5524d` |
| typst-aarch64-apple-darwin.tar.xz | `541e4f9eaca3f34ee865f81fc663e4839cb84d6253f71a372cd855b0a7283213` | 11034064 | `34fc7d640227c420a4a5de9c45eba0e82e6573b9e292bdeab1d04ab1800e3dd7` |

`scripts/ensure-typst.ts` downloads the archive for the current Linux or macOS arch, verifies the archive SHA-256, verifies the extracted typst binary SHA-256 (not a stamp file), checks `typst --version` is exactly 0.13.1, and deletes the extract directory. `TYPST_BIN` must also be typst 0.13.1. `render-typst-cv` sets `SOURCE_DATE_EPOCH=0` unless the environment already has one, so CreationDate is deterministic.

The npm packages `typst@0.10.x` and `typst-cli@1.0.0` were not used (`typst-cli` is a 223-byte stub; 0.10 would not match 0.13.1 layout).

Vercel/CI need outbound HTTPS to GitHub Releases (public, no token). If a build environment blocks that, vendor the verified tarball in this package or fail the build; do not add secrets.

## Official 0.15.1 archives (tested, not used)

Downloaded from `https://github.com/typst/typst/releases/download/v0.15.1/` on 25 Nov 2026.

| Archive | SHA-256 | Bytes |
|---|---|---|
| typst-x86_64-unknown-linux-musl.tar.xz | `a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c` | 17462992 |
| typst-aarch64-unknown-linux-musl.tar.xz | `5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee` | 16216812 |
| typst-x86_64-apple-darwin.tar.xz | `7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa` | 15635600 |
| typst-aarch64-apple-darwin.tar.xz | `48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a` | 14438168 |

x86_64 Linux musl typst 0.15.1 binary SHA-256: `29273eaa04f6d00edd0c2bec578f565fc9c65be856bfbffc894567c68ed0b237`.
