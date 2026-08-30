export type Command =
  | { name: "help" }
  | { name: "list" }
  | { name: "status" }
  | { name: "open"; target: "last" | { pack: string } }
  | { name: "link" }
  | { name: "sync" }
  | { name: "pick" }
  | { name: "generate"; pack: "master" | { ref: string }; noSubmitCopy: boolean }
  | { name: "default" };

const VERBS = new Set(["help", "list", "status", "open", "link", "link-packs", "sync", "pick", "generate"]);

export function parseArgv(argv: string[]): Command {
  const args = argv.filter((arg) => arg !== "--");
  if (args.includes("-h") || args.includes("--help") || args[0] === "help") {
    return { name: "help" };
  }

  const noSubmitCopy = args.includes("--no-submit-copy");
  const positional = args.filter((arg) => !arg.startsWith("-"));
  const verb = positional[0];

  if (!verb) return { name: "default" };

  if (!VERBS.has(verb)) {
    return { name: "generate", pack: { ref: verb }, noSubmitCopy };
  }

  if (verb === "list") return { name: "list" };
  if (verb === "status") return { name: "status" };
  if (verb === "link" || verb === "link-packs") return { name: "link" };
  if (verb === "sync") return { name: "sync" };
  if (verb === "pick") return { name: "pick" };

  if (verb === "open") {
    const target = positional[1];
    if (!target || target === "last") return { name: "open", target: "last" };
    return { name: "open", target: { pack: target } };
  }

  if (verb === "generate") {
    const packRef = positional[1];
    if (!packRef || packRef === "master" || args.includes("--master")) {
      return { name: "generate", pack: "master", noSubmitCopy };
    }
    return { name: "generate", pack: { ref: packRef }, noSubmitCopy };
  }

  return { name: "help" };
}

export const HELP = `Usage:
  kanithanj.cv                     list packs (TTY: pick, then generate)
  kanithanj.cv list
  kanithanj.cv status
  kanithanj.cv open [pack|last]
  kanithanj.cv link                symlink XDG packs into this home
  kanithanj.cv sync                refresh CLI + facts from GitHub (or local vendor)
  kanithanj.cv generate [pack]     write PDF (master if omitted)
  kanithanj.cv <pack|opp_N|id>     generate (same as generate <pack>)
  kanithanj.cv generate <pack> --no-submit-copy

How to use:
  1. Install once (Preferences or scripts/install-kanithanj-cv.sh).
  2. kanithanj.cv list && kanithanj.cv generate <pack> && kanithanj.cv open last
  3. After you edit and push site cvdata: kanithanj.cv sync
  Facts file: ~/.config/kanithanj.cv/cvdata.json
  Upload: write that file, then KANITHANJ_CVDATA_SYNC=0 kanithanj.cv sync
  CVDATA_SRC wins when set. No local hook.

Packs resolve in order: COLLAB_FINDER_PACKS, XDG collab-finder/application_packs, ./application_packs.
generate is the only write. list / status / open do not write.
`;
