export const TYPST_VERSION = "0.13.1";
export const TYPST_COMMIT = "8ace67d9";
export const TYPST_TESTED_ON = "2026-11-25";
export const TYPST_TESTED_ZONE = "Europe/Stockholm";
export const TYPST_SOURCE_DATE_EPOCH = "0";
export const TYPST_RELEASE = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}`;

export const TYPST_LATEST_TESTED = "0.15.1";
export const TYPST_LATEST_COMMIT = "9dfd3a08";

export type TypstArchive = {
  file: string;
  sha256: string;
  size: number;
  binarySha256: string;
};

export const TYPST_ARCHIVES: Record<string, TypstArchive> = {
  "x86_64-linux": {
    file: "typst-x86_64-unknown-linux-musl.tar.xz",
    sha256: "7d214bfeffc2e585dc422d1a09d2b144969421281e8c7f5d784b65fc69b5673f",
    size: 13608296,
    binarySha256: "61f743dccaaf7d763072ae046ad71f2303752e78d499d319043248f894602f45",
  },
  "arm64-linux": {
    file: "typst-aarch64-unknown-linux-musl.tar.xz",
    sha256: "4f5b7ee6e57fb639019ee0f6bffcf940edad228ede6ff5269a9f05a1544ceed4",
    size: 12888772,
    binarySha256: "ce3c5ddac1e47bd75d9a8cc0c7620158873e70719fdfc1673beb1da474ab2e95",
  },
  "x86_64-darwin": {
    file: "typst-x86_64-apple-darwin.tar.xz",
    sha256: "4dabfe647f7f01ed9cc13ad8196a6c7f5e16f0732821b522d50740d3a9f5207b",
    size: 11789644,
    binarySha256: "c8d4f613159ac9d2d180f64a857df2d37ce008c0f1751fee82352a829af5524d",
  },
  "arm64-darwin": {
    file: "typst-aarch64-apple-darwin.tar.xz",
    sha256: "541e4f9eaca3f34ee865f81fc663e4839cb84d6253f71a372cd855b0a7283213",
    size: 11034064,
    binarySha256: "34fc7d640227c420a4a5de9c45eba0e82e6573b9e292bdeab1d04ab1800e3dd7",
  },
};

export function typstArchiveFor(platform: NodeJS.Platform, arch: string): TypstArchive {
  const cpu = arch === "x64" ? "x86_64" : arch === "arm64" ? "arm64" : arch;
  const key = `${cpu}-${platform}`;
  const archive = TYPST_ARCHIVES[key];
  if (!archive) {
    throw new Error(
      `No pinned Typst ${TYPST_VERSION} archive for ${platform}/${arch}. Pinned: Linux musl and macOS, x86_64 and arm64.`,
    );
  }
  return archive;
}
