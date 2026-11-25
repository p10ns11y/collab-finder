import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTypstView } from "./typst-view";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dir, "../../typst/fixtures/ada-cvdata.json"), "utf8"),
);

describe("buildTypstView", () => {
  test("canonical name, headline and summary override cv_pdf", () => {
    const view = buildTypstView({
      ...fixture,
      name: "Ada Override",
      profile: "PROFILE_SENTINEL_ALPHA from site profile",
      landing: { role: "Headline from landing.role" },
    });
    expect(view.name).toBe("Ada Override");
    expect(view.headline).toBe("Headline from landing.role");
    expect(view.summary).toBe("PROFILE_SENTINEL_ALPHA from site profile");
    expect(view.document.author).toBe("Ada Override");
  });

  test("throws when cv_pdf is missing", () => {
    expect(() => buildTypstView({ name: "Ada Fixture" })).toThrow(/cv_pdf/);
  });
});
