import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCvOverlay } from "./cv-overlay";
import { buildTypstView, projectsShownFromView } from "./typst-view";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dir, "../../typst/fixtures/ada-cvdata.json"), "utf8"),
);

const base = {
  ...fixture,
  projects: [
    {
      key: "collab-finder",
      name: "PROJECT_SENTINEL_COLLAB",
      description: "Shipped a small public tool used by the fixture suite.",
      url: "https://example.com/collab",
    },
    {
      key: "kept-off",
      name: "OFFSTAGE_PROJECT",
      description: "Should vanish when not featured.",
      url: "https://example.com/off",
    },
  ],
};

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

  test("renders the approved Kanithanj sentence in first person", () => {
    const view = buildTypstView({
      ...fixture,
      cv_pdf: {
        ...fixture.cv_pdf,
        independent: {
          ...fixture.cv_pdf.independent,
          items: [
            {
              lead: "kanithanj",
              text: " — Kanithanj began as a private desktop app he uses daily and is now heading to public use once fully actualized.",
            },
          ],
        },
      },
    });
    expect(view.independent.items[0].text).toBe(
      " — Began as a private desktop app I use daily and is now heading to public use once fully actualized.",
    );
  });

  test("featured_keys and projects_upsert reach typst items and projects_shown", () => {
    const { data, featuredKeys, upsertedKeys } = applyCvOverlay(base, {
      featured_keys: ["upserted-proj", "collab-finder"],
      projects_upsert: [
        {
          key: "upserted-proj",
          name: "UPSERT_SENTINEL",
          description: "Upserted project reaches typst",
          url: "https://example.com/upsert",
        },
        {
          key: "collab-finder",
          name: "PROJECT_SENTINEL_COLLAB",
          description: "Updated collab blurb reaches typst",
          url: "https://example.com/collab-new",
        },
      ],
    });
    const view = buildTypstView(data, { featuredKeys, upsertedKeys });
    const leads = view.independent.items.map((item) => item.lead);
    expect(leads).toEqual(["UPSERT_SENTINEL", "PROJECT_SENTINEL_COLLAB"]);
    expect(view.independent.items[0].text).toContain("Upserted project reaches typst");
    expect(view.independent.items[1].text).toContain("Updated collab blurb reaches typst");
    expect(view.independent.items[1].links?.[0].url).toBe("https://example.com/collab-new");
    expect(projectsShownFromView(view)).toEqual([
      { key: "upserted-proj", name: "UPSERT_SENTINEL", url: "https://example.com/upsert" },
      { key: "collab-finder", name: "PROJECT_SENTINEL_COLLAB", url: "https://example.com/collab-new" },
    ]);
  });

  test("without an overlay, typst wording stays as stored", () => {
    const view = buildTypstView(base);
    expect(view.independent.items).toHaveLength(1);
    expect(view.independent.items[0].text).toBe(" — Shipped a small public tool used by the fixture suite.");
    expect(view.independent.items[0].links?.[0].url).toBe("https://example.com/collab");
    expect(projectsShownFromView(view)[0]?.key).toBe("collab-finder");
  });
});
