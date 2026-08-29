import { Document, Font, Link, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
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

// Standard PDF fonts (Helvetica, Helvetica-Bold, Times-Roman) are built into
// react-pdf. Do NOT Font.register CDN copies under those family names — broken
// metrics make large name text collapse and contact paint through the name.
Font.register({
  family: "Helvetica",
  src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Helvetica/Helvetica.ttf",
});
Font.register({
  family: "Helvetica-Bold",
  src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Helvetica/Helvetica-Bold.ttf",
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
    fontFamily: "Times-Roman",
    fontSize: 22,
    lineHeight: 1.4,
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
    letterSpacing: 0.5,
    color: "#444",
  },
  text: {
    fontSize: 8.5,
    marginBottom: 2,
    textAlign: "left",
    hyphens: "auto",
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
  columnContainer: {
    flexDirection: "row",
    marginTop: 2,
  },
  leftColumn: {
    width: "61.818182%",
    paddingRight: 12,
  },
  rightColumn: {
    width: "38.181818%",
    paddingLeft: 6,
    borderLeft: 1,
    borderColor: "#eee",
    // paddingBottom: 20
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
    title="Peramanathan Sathyamoorthy - Curriculum Vitae"
    author="Peramanathan Sathyamoorthy"
    subject="Professional Resume for Senior Software Engineer"
    keywords="Software Engineer, JavaScript, TypeScript, ReactJS, Python, Full-Stack Development, Team Leadership"
    creator="Peramanathan Sathyamoorthy, grok-code-fast1, xAI Grok"
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
          <Link
            src={data.cv_social_links.github}
            style={[styles.link, { flexDirection: "row", alignItems: "center" }]}
          >
            <Svg width="12" height="12" viewBox="0 0 24 24">
              <Path
                fill="#646464"
                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
              />
            </Svg>
            <Text style={{ paddingLeft: 2 }}>
              {(data.cv_social_links.github || "")
                .replace(/^https?:\/\//i, "")
                .replace(/\/$/, "") || "GitHub"}
            </Text>
          </Link>
          <Text style={{ color: "#bbb", paddingHorizontal: 4 }}>·</Text>
          <Link
            src={data.cv_social_links.x}
            style={[styles.link, { flexDirection: "row", alignItems: "center" }]}
          >
            <Svg width="10" height="10" viewBox="0 0 24 24">
              <Path
                fill="#646464"
                d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
              />
            </Svg>
            <Text style={{ paddingLeft: 2 }}>{data.cv_social_links.x_handle}</Text>
          </Link>
        </View>
      </View>

      {/* @ts-ignore */}
      <View style={styles.section} id="Profile" bookmark="Profile">
        <Text style={styles.subheader}>Profile</Text>
        {/* Density: clampProfile via CV_LAYOUT_POLICY; soft-job flow via job header atom only */}
        <Text style={styles.text}>{clampProfile(data.profile)}</Text>
      </View>
      <View style={styles.columnContainer}>
        {/* @ts-ignore */}
        <View
          style={styles.leftColumn}
          id="Work Experience"
          bookmark={{ title: "Work Experience", fit: false }}
        >
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
        <View style={styles.rightColumn}>
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
          {/* wrap={false}: keep Technologies as one block — avoid mid-section page split in the right column */}
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
          <View style={styles.section} id="Publications" bookmark="Publications" break>
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
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: 10,
          left: 0,
          right: 0,
          alignItems: "center",
          fontSize: 8,
        }}
        fixed
      >
        <Text>
          {new Date(Date.now()).toLocaleDateString("sv")} © {data.name}
        </Text>
      </View>
      {/* <Text style={{ textAlign: 'center' }} render={({ pageNumber, totalPages }) => (
        `${pageNumber} / ${totalPages}`
      )} fixed /> */}
    </Page>
  </Document>
);

export default CVDocument;
