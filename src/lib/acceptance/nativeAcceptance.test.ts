import { readPdfProvenance } from "../resume/pdfProvenance";
import { expect, it, vi } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { PDFDocument } from "pdf-lib";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { runNativeAcceptance } from "./nativeAcceptance";

it("executes both acceptance stages with an isolated SQL fixture before native launch", async () => {
  const SQL = await initSqlJs(); const database = new SQL.Database();
  const environment = { root: "/synthetic-fixture", databaseUrl: "sqlite:/synthetic-fixture/native.sqlite3", appConfigDir: "/synthetic-fixture/app-config" };
  const artifactNames: string[] = [];
  const artifacts = new Map<string, number[]>();
  vi.mocked(invoke).mockImplementation(async (command, arguments_) => {
    const args = arguments_ as Record<string, unknown>;
    if (command === "transaction_begin") { database.run("BEGIN IMMEDIATE"); return "fixture-transaction" as never; }
    if (command === "transaction_finish") { database.run(args.commit ? "COMMIT" : "ROLLBACK"); return undefined as never; }
    if (command === "acceptance_query" || command === "transaction_query") {
      const query = args.query as string;
      if (query === "PRAGMA database_list") return [{ file: `${environment.root}/native.sqlite3` }] as never;
      if (!args.select) { database.run(query, args.values as (string | number | null)[]); return { rowsAffected: database.getRowsModified(), lastInsertId: 0 } as never; }
      const statement = database.prepare(query); statement.bind(args.values as (string | number | null)[]);
      const rows = []; while (statement.step()) rows.push(statement.getAsObject()); statement.free(); return rows as never;
    }
    if (command === "render_resume_latex") {
      const source = String(args.latexSource);
      if (source.includes("SyntheticUndefinedCommand")) return Promise.reject("latex_compile_failed|LaTeX could not render this resume. Check the content and retry.");
      const pdf = await PDFDocument.create(); pdf.addPage();
      pdf.setTitle(source.includes("Synthetic version A") ? "Synthetic version A" : "Synthetic version B");
      return Array.from(await pdf.save()) as never;
    }
    if (command === "resume_pdf_snapshot") { return { fileBase64: btoa(String.fromCharCode(...artifacts.get("resume-b.pdf")!)) } as never; }
    if (command === "acceptance_artifact") { artifacts.set(args.name as string, args.bytes as number[]); artifactNames.push(args.name as string); return `${environment.root}/${args.name}` as never; }
    throw new Error("Blocked isolated fixture command");
  });
  vi.mocked(readPdfProvenance).mockImplementation(async path => {
    const bytes = new Uint8Array(artifacts.get(path.split("/").at(-1)!)!);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return { version: "cc-pdf-sha256-v1", digest: Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2,"0")).join(""), sizeBytes: bytes.length };
  });
  const first = await runNativeAcceptance(environment, result => { if (result.status === "FAIL") console.error(result); });
  expect(first.results.filter((result) => result.status !== "PASS")).toEqual([]);
  const restarted = await runNativeAcceptance(environment, () => {});
  expect(restarted.results.filter((result) => result.status !== "PASS")).toEqual([]);
  expect(artifactNames).toContain("stage-two.json");
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "render_resume_latex")).toHaveLength(3);
  expect(artifacts.get("resume-a.pdf")).not.toEqual(artifacts.get("resume-b.pdf"));
  expect(database.exec("SELECT kind FROM resume_versions WHERE id='resume-master'")[0].values).toEqual([["master"]]);
  expect(database.exec("SELECT submitted_resume_version_id,submitted_pdf_path FROM applications WHERE id='pdf-historical-submission'")[0].values).toEqual([["resume-a", "/synthetic-fixture/resume-a.pdf"]]);
});
