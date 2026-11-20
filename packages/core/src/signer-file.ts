export type SignerFileStat = {
  readonly uid: number;
  readonly mode: number;
  isSymbolicLink: () => boolean;
  isFile: () => boolean;
};

export const isTrustedSignerFile = (stat: SignerFileStat): boolean =>
  stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0;
