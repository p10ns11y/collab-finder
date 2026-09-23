import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import defaultData from "@/data/cvdata.json";
import {
  getCvFeaturedProjects,
  projectDateRangeLabel,
  projectPublicHostLabel,
} from "@/lib/cv-featured-projects";
import {
  CV_LAYOUT_POLICY,
  clampProfile,
  sliceJobBullets,
  sliceJobTools,
} from "@/lib/cv-layout-policy";

export type CVDocumentProps = {
  /** Master or overlay-merged CV payload. Defaults to `src/data/cvdata.json`. */
  data?: typeof defaultData;
  /** Featured project keys for the PDF column. Defaults to portfolio list. */
  featuredKeys?: readonly string[];
};

// ATS-LAYOUT-POLICY: single-column
// Apply PDFs are read by positional ATS extractors (top-to-bottom, then
// left-to-right). Keep one column, built-in fonts, and unbroken words.
// Do not Font.register CDN copies under Helvetica — that name is a base font,
// and a subset TTF can ship without a ToUnicode map.
// pull-cv-renderer.sh keeps this file while the marker above is present.
// Re-smoke after any pull: `bun scripts/ats-pdf-smoke.tsx`.
//
// A syllable break paints "-" and scrambles pdftotext. Slice a long token
// into newline parts so the line wraps on glue and does not paint that glyph.
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
    // Slight vertical room for header; work experience stays compact below
    paddingTop: 10,
    paddingHorizontal: 24,
    paddingBottom: 28,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.28,
    color: "#333",
  },
  // Name must own a real vertical slot. react-pdf often collapses large Text
  // height (esp. with registered Times), so contact draws through the name.
  headerBlock: {
    marginBottom: 6,
    alignItems: "center",
  },
  nameRow: {
    width: "100%",
    minHeight: 30,
    marginBottom: 8,
    paddingBottom: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    lineHeight: 1.3,
    textAlign: "center",
    color: "#000",
  },
  title: {
    fontSize: 11,
    textAlign: "center",
    paddingTop: 4,
    paddingBottom: 6,
    color: "#555",
  },
  contactLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    fontSize: 9,
    lineHeight: 1.35,
    textAlign: "center",
    marginTop: 1,
    marginBottom: 2,
    color: "#666",
  },
  subheader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 4,
    marginTop: 6,
    borderBottom: 1,
    borderColor: "#ddd",
    paddingBottom: 2,
    textTransform: "uppercase",
    color: "#444",
  },
  text: {
    fontSize: 8.5,
    marginBottom: 2,
    textAlign: "left",
    color: "#333",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 1.5,
    textAlign: "left",
  },
  bullet: {
    width: 8,
    fontSize: 8.5,
    marginRight: 3,
    color: "#333",
  },
  listText: {
    flex: 1,
    fontSize: 8.5,
    color: "#333",
  },
  section: {
    marginBottom: 8,
  },
  technologyCategory: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 2,
    color: "#444",
  },
  technologyList: {
    fontSize: 9,
    color: "#666",
  },
  jobTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 1,
    color: "#333",
  },
  jobDate: {
    fontSize: 8,
    color: "#666",
    marginBottom: 2,
  },
  tools: {
    fontSize: 7.5,
    color: "#646464",
    fontStyle: "italic",
    marginTop: 0.5,
  },
  link: {
    color: "#646464",
    textDecoration: "none",
  },
  rightSectionText: {
    fontSize: 9,
    marginBottom: 3,
    color: "#333",
  },
  rightSectionBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#444",
  },
  projectItem: {
    marginBottom: 3,
  },
  projectName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#0e0e0e",
  },
  publicationItem: {
    marginBottom: 4,
  },
  educationItem: {
    marginBottom: 4,
  },
});

function jobIsIndependentWork(job: { kind?: string }): boolean {
  return job.kind === "independent_work";
}

function ExperienceJobList({
  jobs,
}: {
  jobs: typeof defaultData.work_experience;
}) {
  return (
    <>
      {jobs.map((job, index) => {
        const bullets = sliceJobBullets(job.responsibilities, index);
        const tools = sliceJobTools(job.tools);
        const companyUrl =
          "company_url" in job && typeof (job as { company_url?: string }).company_url === "string"
            ? (job as { company_url: string }).company_url
            : undefined;
        return (
          <View
            key={`${job.title}-${job.start_date}`}
            wrap={false}
            minPresenceAhead={CV_LAYOUT_POLICY.jobHeaderMinPresenceAhead}
            style={{ marginBottom: CV_LAYOUT_POLICY.jobMarginBottom }}
          >
            <View>
              {/* @ts-ignore */}
              <Text
                style={styles.jobTitle}
                bookmark={`${job.title} | ${job.company}, ${job.location}`}
              >
                {job.title} |{" "}
                {companyUrl ? (
                  <Link src={companyUrl} style={[styles.link, { color: "#333" }]}>
                    {job.company}
                  </Link>
                ) : (
                  job.company
                )}
                , {job.location}
              </Text>
              <Text style={styles.jobDate}>
                {job.start_date} - {job.end_date}
              </Text>
            </View>
            {bullets.map((resp, bulletIndex) => (
              <View key={bulletIndex} style={styles.listItem} wrap={false}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{resp}</Text>
              </View>
            ))}
            <Text style={styles.tools} wrap={false}>
              Tools: {tools.join(", ")}
            </Text>
          </View>
        );
      })}
    </>
  );
}

const CVDocument = ({
  data = defaultData,
  featuredKeys,
}: CVDocumentProps = {}) => (
  <Document
    title={`${data.name} - Curriculum Vitae`}
    author={data.name}
    subject="Curriculum Vitae"
    keywords="curriculum vitae"
    creator={data.name}
    producer="react-pdf"
    pdfVersion="1.7"
    language="en-US"
    pageMode="useOutlines"
    pageLayout="singlePage"
  >
    {/* @ts-ignore */}
    <Page
      size="A4"
      orientation="portrait"
      dpi={300}
      style={styles.page}
      bookmark="Table of Contents"
    >
      {/* @ts-ignore */}
      <View style={styles.headerBlock} bookmark="Header">
        {/* Dedicated name row reserves height so contact cannot paint through the name. */}
        <View style={styles.nameRow}>
          <Text style={styles.header}>{data.name}</Text>
        </View>
        {/* Role under name omitted: saves space, avoids role fixation per application, no per-pack title edit. */}
        <View style={styles.contactLine}>
          <Link src={`mailto:${data.contact.email}`} style={styles.link}>
            <Text>{data.contact.email}</Text>
          </Link>
          {data.contact.phone && data.contact.phone_public !== false ? (
            <>
              <Text style={{ color: "#bbb" }}>·</Text>
              <Link src={`tel:${data.contact.phone}`} style={styles.link}>
                <Text>{data.contact.phone}</Text>
              </Link>
            </>
          ) : null}
          <Text style={{ color: "#bbb" }}>·</Text>
          <Text>{data.contact.citizenship}</Text>
        </View>
        <View style={styles.contactLine}>
          {/* GitHub: href MUST be github URL (was wrongly bound to x.com). */}
          <Link src={data.cv_social_links.github} style={styles.link}>
            <Text>
              {(data.cv_social_links.github || "")
                .replace(/^https?:\/\//i, "")
                .replace(/\/$/, "") || "GitHub"}
            </Text>
          </Link>
          <Text style={{ color: "#bbb", paddingHorizontal: 4 }}>·</Text>
          <Link src={data.cv_social_links.x} style={styles.link}>
            <Text>{data.cv_social_links.x_handle}</Text>
          </Link>
        </View>
      </View>

      {/* @ts-ignore */}
      <View style={styles.section} id="Profile" bookmark="Profile">
        <Text style={styles.subheader}>Profile</Text>
        {/* Density: clampProfile via CV_LAYOUT_POLICY; soft-job flow via job header atom only */}
        <Text style={styles.text}>{clampProfile(data.profile)}</Text>
      </View>
      <View id="Work Experience" bookmark={{ title: "Work Experience", fit: false }}>
        {data.work_experience.some(jobIsIndependentWork) ? (
          <>
            <Text style={styles.subheader}>Independent Work</Text>
            <ExperienceJobList
              jobs={data.work_experience.filter(jobIsIndependentWork)}
            />
          </>
        ) : null}
        <Text style={styles.subheader}>Work Experience</Text>
        <ExperienceJobList
          jobs={data.work_experience.filter((job) => !jobIsIndependentWork(job))}
        />
      </View>
      {/* @ts-ignore */}
      <View style={styles.section} id="Skills" bookmark="Skills">
            <Text style={styles.subheader}>Skills</Text>
            <Text style={styles.rightSectionText}>
              <Text style={styles.rightSectionBold}>Product: </Text>
              <Text style={{ fontStyle: "italic" }}>{data.skills.product.join(", ")}</Text>
            </Text>
            <Text style={styles.rightSectionText}>
              <Text style={styles.rightSectionBold}>Development: </Text>
              <Text style={{ fontStyle: "italic" }}>{data.skills.practices.join(", ")}</Text>
            </Text>
          </View>
          {/* @ts-ignore */}
          <View style={styles.section} id="Projects" bookmark={{ title: "Projects", fit: false }}>
            <Text style={styles.subheader}>Projects</Text>
            {getCvFeaturedProjects(data.projects, featuredKeys).map((project, index) => (
              <View key={index} style={styles.projectItem} wrap={false}>
                <Link src={project.url} style={[styles.link, styles.projectName]}>
                  {project.name}
                </Link>
                {projectDateRangeLabel(project) || projectPublicHostLabel(project) ? (
                  <Text style={{ fontSize: 7, color: "#666", marginTop: 1 }}>
                    {[projectDateRangeLabel(project), projectPublicHostLabel(project)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 8, fontStyle: "italic", color: "#1c1c1c", marginTop: 1 }}>
                  {project.description}
                </Text>
              </View>
            ))}
          </View>
          {/* @ts-ignore */}
          <View
            style={styles.section}
            id="AI Courses"
            bookmark={{ title: "AI Courses", fit: false }}
          >
            <Text style={styles.subheader}>AI Courses</Text>
            {data.courses.map((course, index) => {
              // Prefer explicit provider/issuer; fall back to domain. Never leave AI courses bare.
              const c = course as {
                name: string;
                url?: string;
                domain?: string;
                provider?: string;
                issuer?: string;
                completionDate?: string;
              };
              const provider =
                c.provider?.trim() ||
                c.issuer?.trim() ||
                (c.url?.includes("deeplearning.ai")
                  ? "DeepLearning.AI"
                  : c.url?.includes("credly.com") || c.name?.toLowerCase().includes("cilium")
                    ? "Isovalent"
                    : undefined);
              const year = c.completionDate?.slice(0, 4);
              const meta = [provider, c.domain, year].filter(Boolean).join(" · ");
              return (
                <View key={index} style={styles.projectItem}>
                  <Link
                    src={c.url || "#"}
                    style={[styles.link, { fontSize: 9, fontFamily: "Helvetica-Bold" }]}
                  >
                    {c.name}
                  </Link>
                  {meta ? (
                    <Text style={{ fontSize: 7, fontStyle: "italic", color: "#666", marginTop: 1 }}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          {/* wrap={false}: keep Technologies as one block so a page break does not split the list */}
          {/* @ts-ignore */}
          <View
            style={styles.section}
            id="Technologies"
            bookmark="Technologies"
            wrap={false}
          >
            <Text style={styles.subheader}>Technologies</Text>
            {Object.entries(data.technologies).map(([cat, items], i) => (
              <Text key={i} style={{ marginBottom: 3 }}>
                <Text style={styles.technologyCategory}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}:{" "}
                </Text>
                <Text style={styles.technologyList}>{items.join(", ")}</Text>
              </Text>
            ))}
          </View>
          {/* @ts-ignore */}
          <View style={styles.section} id="Publications" bookmark="Publications">
            <Text style={styles.subheader}>Publications</Text>
            {data.publications.map((pub, i) => (
              <View key={i} style={styles.publicationItem}>
                <Link
                  src={pub.doi_url || pub.url}
                  style={[styles.link, { fontSize: 9, fontFamily: "Helvetica-Bold" }]}
                >
                  {pub.title}
                </Link>
                <Text style={{ fontSize: 8, color: "#666", marginTop: 1 }}>
                  {pub.journal
                    ? `${pub.journal.name}, ${pub.first_published}`
                    : `${pub.conference}, ${pub.date}`}
                </Text>
              </View>
            ))}
          </View>
          {/* @ts-ignore */}
          <View style={styles.section} id="Education" bookmark="Education">
            <Text style={styles.subheader}>Education</Text>
            {data.education.map((edu, i) => (
              <View key={i} style={styles.educationItem}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>{edu.degree}</Text>
                <Text style={styles.rightSectionText}>{edu.institution}</Text>
                <Text>{edu.years}</Text>
              </View>
            ))}
          </View>
          {/* @ts-ignore */}
          <View style={styles.section} id="Languages" bookmark="Languages">
            <Text style={styles.subheader}>Languages</Text>
            {Object.entries(data.languages).map(([lang, level], i) => (
              <Text key={i} style={styles.rightSectionText}>
                {lang}: {level}
              </Text>
            ))}
          </View>
      <Text style={{ marginTop: 8, fontSize: 8, textAlign: "center", color: "#666" }}>
        {new Date(Date.now()).toLocaleDateString("sv")} © {data.name}
      </Text>
    </Page>
  </Document>
);

export default CVDocument;
