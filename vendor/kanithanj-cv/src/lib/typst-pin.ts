export const TYPST_VERSION = "0.13.1";
export const TYPST_COMMIT = "8ace67d9";
export const TYPST_TESTED_ON = "2026-11-25";
export const TYPST_TESTED_ZONE = "Europe/Stockholm";
export const TYPST_RELEASE = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}`;

export type TypstArchive = {
  file: string;
  sha256: string;
  size: number;
};

export const TYPST_ARCHIVES: Record<string, TypstArchive> = {
  "x86_64-linux": {
    file: "typst-x86_64-unknown-linux-musl.tar.xz",
    sha256: "7d214bfeffc2e585dc422d1a09d2b144969421281e8c7f5d784b65fc69b5673f",
    size: 13608296,
  },
  "arm64-linux": {
    file: "typst-aarch64-unknown-linux-musl.tar.xz",
    sha256: "4f5b7ee6e57fb639019ee0f6bffcf940edad228ede6ff5269a9f05a1544ceed4",
    size: 12888772,
  },
};

export function typstArchiveFor(platform: NodeJS.Platform, arch: string): TypstArchive {
  const key = `${arch === "x64" ? "x86_64" : arch === "arm64" ? "arm64" : arch}-${platform}`;
  const archive = TYPST_ARCHIVES[key];
  if (!archive) {
    throw new Error(
      `No pinned Typst ${TYPST_VERSION} archive for ${platform}/${arch}. Tested Linux x86_64 and arm64 musl only.`,
    );
  }
  return archive;
}
