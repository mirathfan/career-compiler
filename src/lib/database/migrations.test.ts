import type { Database } from "sql.js";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { beforeAll, describe, expect, it } from "vitest";
import { migrations } from "./migrations";

let createDatabase: () => Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  createDatabase = () => new SQL.Database();
});

function applyMigration(database: Database, id: number) {
  const migration = migrations.find((candidate) => candidate.id === id);
  if (!migration) throw new Error(`Missing migration ${id}.`);
  database.run(migration.sql);
  database.run(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
    [migration.id, migration.name, "2026-07-15T00:00:00.000Z"],
  );
}

function columnNames(database: Database, table: string) {
  const result = database.exec(`PRAGMA table_info(${table})`)[0];
  return result?.values.map((row) => String(row[1])) ?? [];
}

function tableNames(database: Database) {
  const result = database.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0];
  return result?.values.map((row) => String(row[0])) ?? [];
}

describe("additive database migrations", () => {
  it("upgrades a Milestone 1 database without losing local rows", () => {
    const database = createDatabase();
    applyMigration(database, 1);
    database.run(
      `INSERT INTO career_items VALUES
       ('item-1','project','Local Project','Private Org','','2025','2026',0,'Local only','','',1,1,'created','updated')`,
    );
    database.run(
      `INSERT INTO career_facts VALUES
       ('fact-1','item-1','Preserve this fact.','user_provided','User note','[]','[]','[]',4,1,'created','updated')`,
    );
    database.run(
      `INSERT INTO jobs VALUES
       ('job-1','Local Company','Engineer','','Private job text',NULL,'created','updated')`,
    );
    database.run(
      `INSERT INTO resume_versions VALUES
       ('resume-1','job-1','Local Resume','mir-standard','{}','[]','draft','','created','updated')`,
    );
    database.run(
      `INSERT INTO app_settings VALUES
       ('default','mock','test-model','mir-standard','/private/export')`,
    );

    applyMigration(database, 2);
    applyMigration(database, 3);
    applyMigration(database, 4);

    expect(database.exec("SELECT statement, source_note FROM career_facts WHERE id='fact-1'")[0].values[0])
      .toEqual(["Preserve this fact.", "User note"]);
    expect(database.exec("SELECT raw_description FROM jobs WHERE id='job-1'")[0].values[0][0])
      .toBe("Private job text");
    expect(database.exec("SELECT default_export_directory FROM app_settings")[0].values[0][0])
      .toBe("/private/export");
    expect(columnNames(database, "career_facts")).toContain("source_reference");
    expect(columnNames(database, "resume_versions")).toContain("prompt_versions_json");
    expect(columnNames(database, "applications")).toEqual(
      expect.arrayContaining(["submitted_resume_version_id", "follow_up_date", "next_action"]),
    );
    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        "applications",
        "evaluation_summaries",
        "migration_events",
        "career_copilot_threads",
        "career_copilot_messages",
        "search_documents",
        "search_embeddings",
        "resume_recommendations",
        "resume_favorites",
        "resume_archives",
      ]),
    );
    expect(database.exec("SELECT id FROM schema_migrations ORDER BY id")[0].values).toEqual([[1], [2], [3], [4]]);
    database.close();
  });

  it("upgrades a Milestone 2 database while preserving generation metadata", () => {
    const database = createDatabase();
    applyMigration(database, 1);
    applyMigration(database, 2);
    database.run(
      `INSERT INTO jobs VALUES
       ('job-2','Saved Company','Backend Engineer','','Saved description','{}','created','updated')`,
    );
    database.run(
      `INSERT INTO resume_versions
       (id,job_id,name,template_id,content_json,validation_json,status,last_export_path,created_at,updated_at,
        parent_resume_version_id,generation_provider,generation_model,prompt_version,generation_metadata_json,
        deterministic_baseline_json)
       VALUES ('resume-2','job-2','Saved Resume','ai-full-stack','{}','[]','approved','/tmp/resume.pdf',
        'created','updated','parent-1','openai','saved-model','prompt-v2','{"calls":[]}',NULL)`,
    );

    applyMigration(database, 3);
    applyMigration(database, 4);

    const row = database.exec(
      "SELECT generation_provider,generation_model,prompt_version,last_export_path,layout_profile_id FROM resume_versions",
    )[0].values[0];
    expect(row).toEqual(["openai", "saved-model", "prompt-v2", "/tmp/resume.pdf", "general-software-engineer"]);
    expect(columnNames(database, "app_settings")).toEqual(
      expect.arrayContaining([
        "template_settings_json",
        "developer_mode",
        "ui_state_json",
        "semantic_search_mode",
        "allow_remote_embeddings",
      ]),
    );
    expect(tableNames(database)).toContain("applications");
    database.close();
  });

  it("adds Career Copilot search tables without changing application rows", () => {
    const database = createDatabase();
    applyMigration(database, 1);
    applyMigration(database, 2);
    applyMigration(database, 3);
    database.run(
      `INSERT INTO applications (
        id, job_id, company, role, job_url, resume_version_id, status, applied_date,
        referral_contact, notes, created_at, updated_at
      ) VALUES (
        'app-1', 'job-1', 'NVIDIA', 'Systems Engineer', '', 'resume-1', 'interview', '2026-07-01',
        'Referral', 'Follow up next week.', 'created', 'updated'
      )`,
    );

    applyMigration(database, 4);

    const row = database.exec(
      "SELECT company, status, notes, submitted_resume_version_id, follow_up_date, next_action FROM applications WHERE id='app-1'",
    )[0].values[0];
    expect(row).toEqual(["NVIDIA", "interview", "Follow up next week.", "", "", ""]);
    expect(tableNames(database)).toEqual(
      expect.arrayContaining(["saved_application_answers", "career_imports", "search_index_events"]),
    );
    database.close();
  });

  it("adds Candidate Brain and application autofill tables additively", () => {
    const database = createDatabase();
    applyMigration(database, 1);
    applyMigration(database, 2);
    applyMigration(database, 3);
    applyMigration(database, 4);
    applyMigration(database, 5);

    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        "candidate_claims",
        "sensitive_answers",
        "candidate_preferences",
        "career_stories",
        "approved_application_answers",
        "application_fields",
      ]),
    );
    expect(columnNames(database, "applications")).toEqual(
      expect.arrayContaining([
        "automation_mode",
        "application_url",
        "ats_platform",
        "match_score",
        "submitted_at",
        "job_snapshot_json",
        "status_history_json",
      ]),
    );
    database.close();
  });
});
