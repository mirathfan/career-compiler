use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static LATEX_RENDER_COUNTER: AtomicU64 = AtomicU64::new(0);
const XELATEX_ARGUMENTS: [&str; 5] = [
    "-no-shell-escape",
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    "resume.tex",
];

fn find_xelatex() -> Option<PathBuf> {
    [
        "/Library/TeX/texbin/xelatex",
        "/usr/local/bin/xelatex",
        "/opt/homebrew/bin/xelatex",
    ]
    .iter()
    .map(PathBuf::from)
    .find(|path| path.is_file())
    .or_else(|| {
        std::env::var_os("PATH").and_then(|paths| {
            std::env::split_paths(&paths)
                .map(|directory| directory.join("xelatex"))
                .find(|path| path.is_file())
        })
    })
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

    let result = (|| {
        fs::write(&source_path, latex_source.as_bytes())
            .map_err(|_| "latex_temp_failed|Could not prepare the LaTeX source.".to_string())?;
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
        fs::read(pdf_path)
            .map_err(|_| "latex_output_missing|LaTeX did not produce a PDF.".to_string())
    })();

    let _ = fs::remove_dir_all(directory);
    result
}

#[tauri::command]
pub fn write_pdf_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, bytes).map_err(|error| format!("Could not write PDF: {error}"))
}

#[tauri::command]
pub fn write_text_file(path: String, text: String) -> Result<(), String> {
    fs::write(&path, text).map_err(|error| format!("Could not write text file: {error}"))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Could not read text file: {error}"))
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
}
