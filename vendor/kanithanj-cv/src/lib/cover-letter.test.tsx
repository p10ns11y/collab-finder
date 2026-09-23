import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderToFile } from "@react-pdf/renderer";
import CoverLetterDocument from "@/components/cover-letter-document";
import {
  buildCoverLetterFilename,
  contactEmailFromCvdata,
  coverLetterBody,
  planCoverLetterPdf,
} from "./cover-letter";

describe("coverLetterBody", () => {
  test("returns null for a heading-only or blank letter", () => {
    expect(coverLetterBody(null)).toBeNull();
    expect(coverLetterBody("")).toBeNull();
    expect(coverLetterBody("# Cover letter\n\n")).toBeNull();
    expect(coverLetterBody("# Cover letter\n\n   \n")).toBeNull();
  });

  test("keeps the prepared prose and does not add a salutation", () => {
    const body = coverLetterBody(
      "# Cover letter\n\nDear hiring team, I build TypeScript services.\n\nThe second paragraph stays.\n",
    );
    expect(body).toBe(
      "Dear hiring team, I build TypeScript services.\n\nThe second paragraph stays.",
    );
    expect(body?.includes("I am excited")).toBe(false);
  });

  test("keeps a letter that has no markdown heading", () => {
    expect(coverLetterBody("Hello from the pack.")).toBe("Hello from the pack.");
  });
});

describe("planCoverLetterPdf", () => {
  const input = {
    personName: "Ada Fixture",
    roleTitle: "Staff Engineer",
    jobId: "4956028007",
  };

  test("skips when the markdown has no letter text", () => {
    expect(planCoverLetterPdf("# Cover letter\n\n", input)).toEqual({
      action: "skip",
      reason: "empty",
      filename: "ada-fixture-staff-engineer-4956028007-cover-letter.pdf",
    });
  });

  test("names the PDF beside the CV and keeps the body", () => {
    expect(buildCoverLetterFilename(input)).toBe(
      "ada-fixture-staff-engineer-4956028007-cover-letter.pdf",
    );
    expect(planCoverLetterPdf("# Cover letter\n\nHello team.\n", input)).toEqual({
      action: "write",
      filename: "ada-fixture-staff-engineer-4956028007-cover-letter.pdf",
      body: "Hello team.",
    });
  });
});

describe("contactEmailFromCvdata", () => {
  test("reads a stored email and ignores a blank one", () => {
    expect(contactEmailFromCvdata({ contact: { email: "ada@example.com" } })).toBe(
      "ada@example.com",
    );
    expect(contactEmailFromCvdata({ email: "  " })).toBeNull();
    expect(contactEmailFromCvdata({ email: "ada@example.com" })).toBe("ada@example.com");
    expect(contactEmailFromCvdata(null)).toBeNull();
  });
});

describe("CoverLetterDocument", () => {
  test("renders a text PDF when the letter has text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cover-letter-pdf-"));
    const pdf = join(dir, "letter.pdf");
    try {
      await renderToFile(
        <CoverLetterDocument
          personName="Ada Fixture"
          email="ada.fixture@example.com"
          roleTitle="Staff Engineer"
          company="Northwind"
          body={"Hello hiring team.\n\n" + "https://example.com/" + "longtokensegment".repeat(6)}
        />,
        pdf,
      );
      const bytes = readFileSync(pdf);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(500);
      expect(planCoverLetterPdf("   ", { personName: "Ada Fixture", roleTitle: "role", jobId: "1" }).action).toBe(
        "skip",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
