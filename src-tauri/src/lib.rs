pub mod commands;
pub mod extension_bridge;
pub mod keychain;

use commands::ai::{analyze_job_with_openai, run_openai_structured};
use commands::files::{
    backup_database_before_migration, check_directory_writable, get_xelatex_diagnostics,
    read_evidence_file, read_text_file, render_resume_latex, reveal_in_finder, write_pdf_file,
    write_text_file,
};
use commands::keychain_commands::{
    delete_openai_key, get_openai_key_status, set_openai_key, test_openai_key,
};
use extension_bridge::{
    extension_authorize_resume_file, extension_complete_pending_request,
    extension_generate_pairing_code, extension_get_status, extension_install_native_host,
    extension_next_pending_request, extension_reset_connection, extension_revoke_extension,
    extension_verify_native_host, start_desktop_ipc, ExtensionBridgeState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let extension_bridge_state = ExtensionBridgeState::default();
    tauri::Builder::default()
        .manage(extension_bridge_state.clone())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            if let Err(error) = start_desktop_ipc(extension_bridge_state.clone()) {
                log::warn!("CareerCompiler extension IPC failed to start: {error}");
            }
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
            get_xelatex_diagnostics,
            backup_database_before_migration,
            check_directory_writable,
            read_evidence_file,
            write_pdf_file,
            write_text_file,
            read_text_file,
            reveal_in_finder,
            extension_get_status,
            extension_install_native_host,
            extension_verify_native_host,
            extension_generate_pairing_code,
            extension_revoke_extension,
            extension_reset_connection,
            extension_next_pending_request,
            extension_complete_pending_request,
            extension_authorize_resume_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
