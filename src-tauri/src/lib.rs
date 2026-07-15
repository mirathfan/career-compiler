pub mod commands;
pub mod keychain;

use commands::ai::{analyze_job_with_openai, run_openai_structured};
use commands::files::{
    read_text_file, render_resume_latex, reveal_in_finder, write_pdf_file, write_text_file,
};
use commands::keychain_commands::{
    delete_openai_key, get_openai_key_status, set_openai_key, test_openai_key,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            analyze_job_with_openai,
            run_openai_structured,
            get_openai_key_status,
            set_openai_key,
            test_openai_key,
            delete_openai_key,
            render_resume_latex,
            write_pdf_file,
            write_text_file,
            read_text_file,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
