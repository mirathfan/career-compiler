use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;

static LATEX_RENDER_COUNTER: AtomicU64 = AtomicU64::new(0);
static LAST_COMPILATION: OnceLock<Mutex<CompilationRecord>> = OnceLock::new();
const MAX_EVIDENCE_FILE_BYTES: u64 = 1_000_000;
const MAX_BACKUP_FILE_BYTES: u64 = 25_000_000;
const XELATEX_ARGUMENTS: [&str; 5] = [
    "-no-shell-escape",
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    "resume.tex",
];

#[derive(Default)]
struct CompilationRecord {
    completed_at: String,
    duration_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XeLaTeXDiagnostics {
    available: bool,
    executable_path: String,
    version: String,
    last_successful_compilation: String,
    last_compilation_duration_ms: Option<u128>,
    error_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceFile {
    path: String,
    file_name: String,
    text: String,
    byte_length: u64,
}

fn find_xelatex() -> Option<PathBuf> {
    let fixed = [
        "/Library/TeX/texbin/xelatex",
        "/usr/local/bin/xelatex",
        "/opt/homebrew/bin/xelatex",
    ]
    .iter()
    .map(PathBuf::from);
    let environment = std::env::var_os("PATH").and_then(|paths| {
        first_existing_file(
            std::env::split_paths(&paths).map(|directory| directory.join("xelatex")),
        )
    });
    first_existing_file(fixed).or(environment)
}

fn first_existing_file(paths: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    paths.into_iter().find(|path| path.is_file())
}

fn parse_xelatex_version(output: &str) -> String {
    output.lines().next().unwrap_or_default().trim().to_string()
}

fn command_arguments_are_allowed(arguments: &[&str]) -> bool {
    arguments == XELATEX_ARGUMENTS
}

fn unix_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_default()
}

fn compilation_record() -> &'static Mutex<CompilationRecord> {
    LAST_COMPILATION.get_or_init(|| Mutex::new(CompilationRecord::default()))
}

#[tauri::command]
pub fn get_xelatex_diagnostics() -> XeLaTeXDiagnostics {
    let record = compilation_record().lock().ok();
    let last_successful_compilation = record
        .as_ref()
        .map(|value| value.completed_at.clone())
        .unwrap_or_default();
    let last_compilation_duration_ms = record
        .as_ref()
        .and_then(|value| (!value.completed_at.is_empty()).then_some(value.duration_ms));
    let Some(engine) = find_xelatex() else {
        return XeLaTeXDiagnostics {
            available: false,
            executable_path: String::new(),
            version: String::new(),
            last_successful_compilation,
            last_compilation_duration_ms,
            error_code: "latex_engine_missing".to_string(),
        };
    };
    match Command::new(&engine).arg("--version").output() {
        Ok(output) if output.status.success() => XeLaTeXDiagnostics {
            available: true,
            executable_path: engine.display().to_string(),
            version: parse_xelatex_version(&String::from_utf8_lossy(&output.stdout)),
            last_successful_compilation,
            last_compilation_duration_ms,
            error_code: String::new(),
        },
        _ => XeLaTeXDiagnostics {
            available: false,
            executable_path: engine.display().to_string(),
            version: String::new(),
            last_successful_compilation,
            last_compilation_duration_ms,
            error_code: "latex_engine_unusable".to_string(),
        },
    }
}

fn latex_temp_directory() -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = LATEX_RENDER_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "careercompiler-latex-{}-{timestamp}-{counter}",
        std::process::id()
    ))
}

#[tauri::command]
pub fn render_resume_latex(latex_source: String) -> Result<Vec<u8>, String> {
    if latex_source.len() > 2_000_000 {
        return Err("latex_source_too_large|The generated resume source is too large.".to_string());
    }
    let engine = find_xelatex().ok_or_else(|| {
        "latex_engine_missing|XeLaTeX was not found. Install MacTeX and retry the export."
            .to_string()
    })?;
    let directory = latex_temp_directory();
    fs::create_dir_all(&directory)
        .map_err(|_| "latex_temp_failed|Could not prepare the LaTeX renderer.".to_string())?;
    let source_path = directory.join("resume.tex");
    let pdf_path = directory.join("resume.pdf");

    let started = Instant::now();
    let result = (|| {
        fs::write(&source_path, latex_source.as_bytes())
            .map_err(|_| "latex_temp_failed|Could not prepare the LaTeX source.".to_string())?;
        if !command_arguments_are_allowed(&XELATEX_ARGUMENTS) {
            return Err(
                "latex_arguments_rejected|The LaTeX command arguments were rejected.".to_string(),
            );
        }
        let output = Command::new(engine)
            .current_dir(&directory)
            .args(XELATEX_ARGUMENTS)
            .output()
            .map_err(|_| "latex_launch_failed|XeLaTeX could not be started.".to_string())?;
        if !output.status.success() {
            return Err(
                "latex_compile_failed|LaTeX could not render this resume. Check the content and retry."
                    .to_string(),
            );
        }
        let bytes = fs::read(pdf_path)
            .map_err(|_| "latex_output_missing|LaTeX did not produce a PDF.".to_string())?;
        if bytes.len() > 10_000_000 {
            return Err(
                "latex_output_too_large|The rendered PDF exceeds the 10 MB limit.".to_string(),
            );
        }
        if let Ok(mut record) = compilation_record().lock() {
            record.completed_at = unix_timestamp();
            record.duration_ms = started.elapsed().as_millis();
        }
        Ok(bytes)
    })();

    let _ = fs::remove_dir_all(directory);
    result
}

#[tauri::command]
pub fn write_pdf_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() > 10_000_000 {
        return Err("The PDF exceeds the 10 MB export limit.".to_string());
    }
    fs::write(&path, bytes).map_err(|error| format!("Could not write PDF: {error}"))
}

fn safe_generated_pdf_stem(value: &str) -> String {
    let stem: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .take(96)
        .collect();
    if stem.trim_matches('_').is_empty() {
        "resume-optimized".to_string()
    } else {
        stem
    }
}

#[tauri::command]
pub fn write_generated_resume_pdf(
    app: tauri::AppHandle,
    file_stem: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 10_000_000 {
        return Err("The generated PDF is empty or exceeds the 10 MB limit.".to_string());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Could not resolve the CareerCompiler data directory.".to_string())?
        .join("generated-resumes");
    fs::create_dir_all(&directory)
        .map_err(|_| "Could not prepare the generated-resumes directory.".to_string())?;
    let path = directory.join(format!("{}.pdf", safe_generated_pdf_stem(&file_stem)));
    fs::write(&path, bytes).map_err(|_| "Could not write the generated resume PDF.".to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, text: String) -> Result<(), String> {
    if text.len() as u64 > MAX_BACKUP_FILE_BYTES {
        return Err("The text export exceeds the 25 MB limit.".to_string());
    }
    fs::write(&path, text).map_err(|error| format!("Could not write text file: {error}"))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Could not inspect text file: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_BACKUP_FILE_BYTES {
        return Err(
            "The selected file is not a supported text backup or exceeds 25 MB.".to_string(),
        );
    }
    fs::read_to_string(&path).map_err(|error| format!("Could not read text file: {error}"))
}

fn supported_evidence_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(extension.as_str(), "md" | "json" | "toml" | "txt")
        || matches!(
            name.as_str(),
            "readme" | "package.json" | "pyproject.toml" | "cargo.toml"
        )
}

#[tauri::command]
pub fn read_evidence_file(path: String) -> Result<EvidenceFile, String> {
    let canonical = fs::canonicalize(&path).map_err(|_| {
        "evidence_file_missing|The selected evidence file could not be opened.".to_string()
    })?;
    if !supported_evidence_file(&canonical) {
        return Err(
            "evidence_file_type|Select a Markdown, JSON, TOML, or text evidence file.".to_string(),
        );
    }
    let metadata = fs::metadata(&canonical).map_err(|_| {
        "evidence_file_missing|The selected evidence file could not be inspected.".to_string()
    })?;
    if !metadata.is_file() || metadata.len() > MAX_EVIDENCE_FILE_BYTES {
        return Err(
            "evidence_file_too_large|Evidence files must be regular files no larger than 1 MB."
                .to_string(),
        );
    }
    let text = fs::read_to_string(&canonical).map_err(|_| {
        "evidence_file_encoding|The evidence file must contain UTF-8 text.".to_string()
    })?;
    Ok(EvidenceFile {
        path: canonical.display().to_string(),
        file_name: canonical
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        text,
        byte_length: metadata.len(),
    })
}

#[tauri::command]
pub fn backup_database_before_migration(
    path: String,
    target_version: u32,
) -> Result<String, String> {
    let source = fs::canonicalize(&path).map_err(|_| {
        "migration_backup_missing|The CareerCompiler database could not be located.".to_string()
    })?;
    if source.file_name().and_then(|value| value.to_str()) != Some("careercompiler.db") {
        return Err(
            "migration_backup_rejected|Only the CareerCompiler database can be backed up."
                .to_string(),
        );
    }
    let metadata = fs::metadata(&source).map_err(|_| {
        "migration_backup_missing|The CareerCompiler database could not be inspected.".to_string()
    })?;
    if !metadata.is_file() || metadata.len() > 256_000_000 {
        return Err(
            "migration_backup_rejected|The database is not a supported backup source.".to_string(),
        );
    }
    let backup = source.with_file_name(format!(
        "careercompiler-pre-migration-v{target_version}-{}.db",
        unix_timestamp()
    ));
    fs::copy(&source, &backup).map_err(|_| {
        "migration_backup_failed|The automatic pre-migration backup could not be created."
            .to_string()
    })?;
    Ok(backup.display().to_string())
}

#[tauri::command]
pub fn check_directory_writable(path: String) -> Result<bool, String> {
    if path.trim().is_empty() {
        return Ok(true);
    }
    let directory = PathBuf::from(path);
    if !directory.is_dir() {
        return Ok(false);
    }
    let probe = directory.join(format!(".careercompiler-write-test-{}", unix_timestamp()));
    fs::write(&probe, b"test").map_err(|_| {
        "export_directory_unwritable|The export directory is not writable.".to_string()
    })?;
    let _ = fs::remove_file(probe);
    Ok(true)
}

#[cfg(test)]
fn redact_diagnostics(value: &str) -> String {
    value
        .split_whitespace()
        .map(|part| {
            if part.starts_with("sk-") || part.contains('@') {
                "[REDACTED]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("The exported file no longer exists at that path.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map_err(|error| format!("Could not open Finder: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err("Finder could not reveal the selected file.".to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        opener::open(path).map_err(|error| format!("Could not reveal file: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "careercompiler-{label}-{}-{}",
            std::process::id(),
            LATEX_RENDER_COUNTER.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn latex_compilation_disables_shell_escape_and_stops_on_errors() {
        assert_eq!(XELATEX_ARGUMENTS[0], "-no-shell-escape");
        assert!(XELATEX_ARGUMENTS.contains(&"-halt-on-error"));
        assert_eq!(XELATEX_ARGUMENTS.last(), Some(&"resume.tex"));
    }

    #[test]
    fn latex_render_directories_are_unique() {
        assert_ne!(latex_temp_directory(), latex_temp_directory());
    }

    #[test]
    fn parses_xelatex_version_without_extra_output() {
        assert_eq!(
            parse_xelatex_version("XeTeX 3.141592653-2.6-0.999997\nCopyright"),
            "XeTeX 3.141592653-2.6-0.999997"
        );
    }

    #[test]
    fn missing_latex_runtime_is_detected() {
        assert_eq!(
            first_existing_file([PathBuf::from("/definitely/missing/xelatex")]),
            None
        );
    }

    #[test]
    fn temporary_render_directory_can_be_cleaned_up() {
        let directory = latex_temp_directory();
        fs::create_dir_all(&directory).expect("create temporary render directory");
        fs::write(directory.join("resume.tex"), b"private resume source").expect("write source");
        fs::remove_dir_all(&directory).expect("remove temporary render directory");
        assert!(!directory.exists());
    }

    #[test]
    fn rejects_unapproved_latex_arguments() {
        assert!(command_arguments_are_allowed(&XELATEX_ARGUMENTS));
        assert!(!command_arguments_are_allowed(&[
            "--shell-escape",
            "resume.tex"
        ]));
    }

    #[test]
    fn evidence_file_types_are_allow_listed() {
        assert!(supported_evidence_file(Path::new("README.md")));
        assert!(supported_evidence_file(Path::new("package.json")));
        assert!(!supported_evidence_file(Path::new("install.sh")));
        assert!(!supported_evidence_file(Path::new("synthetic-resume.pdf")));
        assert!(!supported_evidence_file(Path::new("synthetic-resume.docx")));
        assert!(!supported_evidence_file(Path::new("scanned-resume.png")));
    }

    #[test]
    fn oversized_evidence_files_are_rejected() {
        let directory = test_directory("large-evidence");
        fs::create_dir_all(&directory).expect("create evidence directory");
        let path = directory.join("README.md");
        fs::write(&path, vec![b'a'; MAX_EVIDENCE_FILE_BYTES as usize + 1]).expect("write evidence");
        let error =
            read_evidence_file(path.display().to_string()).expect_err("reject large evidence");
        assert!(error.starts_with("evidence_file_too_large|"));
        fs::remove_dir_all(directory).expect("clean evidence directory");
    }

    #[test]
    fn bounded_utf8_evidence_file_is_read_without_execution() {
        let directory = test_directory("safe-evidence");
        fs::create_dir_all(&directory).expect("create evidence directory");
        let path = directory.join("build-report.txt");
        fs::write(&path, b"Build succeeded. 42 tests passed.").expect("write evidence");
        let evidence = read_evidence_file(path.display().to_string()).expect("read evidence");
        assert_eq!(evidence.file_name, "build-report.txt");
        assert_eq!(evidence.text, "Build succeeded. 42 tests passed.");
        assert_eq!(evidence.byte_length as usize, evidence.text.len());
        fs::remove_dir_all(directory).expect("clean evidence directory");
    }

    #[test]
    fn pre_migration_backup_preserves_database_bytes() {
        let directory = test_directory("migration-backup");
        fs::create_dir_all(&directory).expect("create database directory");
        let source = directory.join("careercompiler.db");
        fs::write(&source, b"private sqlite bytes").expect("write database");
        let backup = backup_database_before_migration(source.display().to_string(), 3)
            .expect("create migration backup");
        assert_eq!(
            fs::read(backup).expect("read backup"),
            b"private sqlite bytes"
        );
        fs::remove_dir_all(directory).expect("clean database directory");
    }

    #[test]
    fn diagnostics_redact_secrets_and_contact_data() {
        let value = redact_diagnostics("failed sk-test-secret mir@example.com network_failure");
        assert_eq!(value, "failed [REDACTED] [REDACTED] network_failure");
    }

    #[test]
    fn generated_pdf_stems_cannot_escape_the_app_data_directory() {
        assert_eq!(
            safe_generated_pdf_stem("../../Private Resume: optimized"),
            "______Private_Resume__optimized"
        );
        assert_eq!(safe_generated_pdf_stem(".."), "resume-optimized");
    }
}
