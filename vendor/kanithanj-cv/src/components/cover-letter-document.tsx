import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { coverLetterParagraphs } from "@/lib/cover-letter";

export type CoverLetterDocumentProps = {
  personName: string;
  /** Letter prose already stored in the pack. Must be non-empty. */
  body: string;
  email?: string | null;
  roleTitle?: string | null;
  company?: string | null;
};

// ATS-LAYOUT-POLICY: single-column
// Same wrap rule as the apply CV: one column, built-in Helvetica, long tokens
// sliced on newlines so a line wraps without painting a hyphen.
const ATS_SOFT_WRAP_AT = 28;

Font.registerHyphenationCallback((word) => {
  if (word == null) return [];
  if (word.length <= ATS_SOFT_WRAP_AT) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += ATS_SOFT_WRAP_AT) {
    parts.push(word.slice(i, i + ATS_SOFT_WRAP_AT));
    if (i + ATS_SOFT_WRAP_AT < word.length) parts.push("\n");
  }
  return parts;
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 48,
    paddingBottom: 36,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.4,
    color: "#222",
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    textAlign: "center",
    color: "#000",
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    textAlign: "center",
    color: "#444",
    marginBottom: 2,
  },
  rule: {
    marginTop: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  paragraph: {
    fontSize: 11,
    lineHeight: 1.4,
    textAlign: "left",
    marginBottom: 10,
    color: "#222",
  },
});

function factLine(roleTitle?: string | null, company?: string | null): string {
  return [roleTitle, company]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" · ");
}

const CoverLetterDocument = ({
  personName,
  body,
  email,
  roleTitle,
  company,
}: CoverLetterDocumentProps) => {
  const paragraphs = coverLetterParagraphs(body);
  if (paragraphs.length === 0) {
    throw new Error("Refusing to write a cover letter PDF with no letter text");
  }
  const name = personName.trim() || "Candidate";
  const mail = typeof email === "string" ? email.trim() : "";
  const subject = factLine(roleTitle, company);

  return (
    <Document
      title={`${name} — Cover letter`}
      author={name}
      subject="Cover letter"
      creator={name}
      producer="react-pdf"
      pdfVersion="1.7"
      language="en-US"
    >
      {/* @ts-ignore */}
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Text style={styles.name}>{name}</Text>
        {mail ? <Text style={styles.meta}>{mail}</Text> : null}
        {subject ? <Text style={styles.meta}>{subject}</Text> : null}
        <View style={styles.rule} />
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </Page>
    </Document>
  );
};

export default CoverLetterDocument;
