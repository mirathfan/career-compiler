use std::fs;
use std::path::Path;
use std::process::Command;

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
