import { describe, expect, test } from "bun:test";
import { parseArgv } from "./cv-cli";

describe("parseArgv", () => {
  test("bare invocation is default (list or pick), not generate", () => {
    expect(parseArgv([])).toEqual({ name: "default" });
  });

  test("help flags exit as help", () => {
    expect(parseArgv(["-h"])).toEqual({ name: "help" });
    expect(parseArgv(["--help"])).toEqual({ name: "help" });
    expect(parseArgv(["help"])).toEqual({ name: "help" });
  });

  test("a bare pack ref generates", () => {
    expect(parseArgv(["xai-exceptional-software-engineer-2026-07-17"])).toEqual({
      name: "generate",
      pack: { ref: "xai-exceptional-software-engineer-2026-07-17" },
      noSubmitCopy: false,
    });
  });

  test("generate master is explicit", () => {
    expect(parseArgv(["generate"])).toEqual({
      name: "generate",
      pack: "master",
      noSubmitCopy: false,
    });
    expect(parseArgv(["generate", "--master"])).toEqual({
      name: "generate",
      pack: "master",
      noSubmitCopy: false,
    });
  });

  test("generate pack forwards --no-submit-copy", () => {
    expect(parseArgv(["generate", "opp_17", "--no-submit-copy"])).toEqual({
      name: "generate",
      pack: { ref: "opp_17" },
      noSubmitCopy: true,
    });
    expect(parseArgv(["opp_17", "--no-submit-copy"])).toEqual({
      name: "generate",
      pack: { ref: "opp_17" },
      noSubmitCopy: true,
    });
  });

  test("open last is the default target", () => {
    expect(parseArgv(["open"])).toEqual({ name: "open", target: "last" });
    expect(parseArgv(["open", "last"])).toEqual({ name: "open", target: "last" });
    expect(parseArgv(["open", "opp_17"])).toEqual({ name: "open", target: { pack: "opp_17" } });
  });

  test("read verbs stay read verbs", () => {
    expect(parseArgv(["list"])).toEqual({ name: "list" });
    expect(parseArgv(["status"])).toEqual({ name: "status" });
    expect(parseArgv(["link"])).toEqual({ name: "link" });
    expect(parseArgv(["link-packs"])).toEqual({ name: "link" });
    expect(parseArgv(["sync"])).toEqual({ name: "sync" });
    expect(parseArgv(["pick"])).toEqual({ name: "pick" });
  });
});
