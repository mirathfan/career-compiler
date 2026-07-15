import { Document, Link, Page, PDFDownloadLink, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { ReactNode } from "react";
import type { TailoredResume } from "../../types/domain";
import { formatDateRange } from "../utils";

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingRight: 42,
    paddingBottom: 34,
    paddingLeft: 42,
    fontFamily: "Helvetica",
    fontSize: 9.6,
    color: "#111827",
    lineHeight: 1.25,
  },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center" },
  contact: { marginTop: 4, textAlign: "center", fontSize: 8.8, color: "#374151" },
  sectionTitle: {
    marginTop: 8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    fontFamily: "Helvetica-Bold",
    fontSize: 10.3,
    textTransform: "uppercase",
  },
  row: { marginTop: 5 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  strong: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#4b5563" },
  bullet: { flexDirection: "row", marginTop: 2.5 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  skills: { marginTop: 4 },
});

function includedBullets(section: TailoredResume["projects"][number]) {
  return section.bullets.filter((bullet) => bullet.included);
}

function ResumeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CareerSection({ section }: { section: TailoredResume["projects"][number] }) {
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.rowTop}>
        <Text>
          <Text style={styles.strong}>{section.title}</Text>
          {section.organization ? <Text style={styles.muted}> | {section.organization}</Text> : null}
        </Text>
        <Text style={styles.muted}>{formatDateRange(section.startDate, section.endDate, section.isCurrent)}</Text>
      </View>
      {includedBullets(section).map((bullet) => (
        <View key={bullet.id} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{bullet.text}</Text>
        </View>
      ))}
    </View>
  );
}

export function ResumeDocument({ resume }: { resume: TailoredResume }) {
  const contactItems = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.portfolioUrl,
    resume.header.linkedInUrl,
    resume.header.githubUrl,
  ].filter(Boolean);

  return (
    <Document title={`${resume.header.fullName} Resume`} author={resume.header.fullName}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{resume.header.fullName}</Text>
        <Text style={styles.contact}>
          {contactItems.map((item, index) => (
            <Text key={item}>
              {index > 0 ? " | " : ""}
              {item.startsWith("http") ? <Link src={item}>{item}</Link> : item}
            </Text>
          ))}
        </Text>
        {resume.sectionOrder.map((section) => {
          if (section === "summary" && resume.summary.length) {
            return (
              <ResumeSection key={section} title="Summary">
                {resume.summary.map((line) => (
                  <Text key={line} style={{ marginTop: 4 }}>
                    {line}
                  </Text>
                ))}
              </ResumeSection>
            );
          }
          if (section === "projects" && resume.projects.length) {
            return (
              <ResumeSection key={section} title="Projects">
                {resume.projects.map((project) => (
                  <CareerSection key={project.careerItemId} section={project} />
                ))}
              </ResumeSection>
            );
          }
          if (section === "experience" && resume.experience.length) {
            return (
              <ResumeSection key={section} title="Experience">
                {resume.experience.map((experience) => (
                  <CareerSection key={experience.careerItemId} section={experience} />
                ))}
              </ResumeSection>
            );
          }
          if (section === "education" && resume.education.length) {
            return (
              <ResumeSection key={section} title="Education">
                {resume.education.map((entry) => (
                  <View key={entry.careerItemId} style={styles.rowTop}>
                    <Text>
                      <Text style={styles.strong}>{entry.organization}</Text>
                      {entry.title ? <Text> | {entry.title}</Text> : null}
                    </Text>
                    <Text style={styles.muted}>{entry.dateLabel}</Text>
                  </View>
                ))}
              </ResumeSection>
            );
          }
          if (section === "skills" && resume.skills.length) {
            return (
              <ResumeSection key={section} title="Skills">
                <Text style={styles.skills}>{resume.skills.join(" | ")}</Text>
              </ResumeSection>
            );
          }
          return null;
        })}
      </Page>
    </Document>
  );
}

export async function renderResumePdfBytes(resume: TailoredResume) {
  const blob = await pdf(<ResumeDocument resume={resume} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function countPdfPages(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  return document.getPageCount();
}

export { PDFDownloadLink };
