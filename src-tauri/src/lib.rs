pub mod acceptance;
pub mod acceptance_bridge;
pub mod commands;
pub mod extension_bridge;
pub mod keychain;
pub mod transactions;

// Explicit maintenance CLI only; owner execution remains disabled in its adapter.
// No normal startup path or Tauri command calls this module.
#[cfg(any(test, feature = "migration012-adapter"))]
pub mod migration012;

use commands::ai::{analyze_job_with_openai, run_openai_structured};
use commands::files::{
    backup_database_before_migration, check_directory_writable, get_xelatex_diagnostics,
    read_evidence_file, read_text_file, render_resume_latex, reveal_in_finder,
    write_generated_resume_pdf, write_pdf_file, write_text_file,
};
use commands::job_sources::fetch_public_job_board;
use commands::keychain_commands::{
    delete_openai_key, get_openai_key_status, set_openai_key, test_openai_key,
};
use extension_bridge::{
    extension_authorize_resume_file, extension_complete_pending_request,
    extension_generate_pairing_code, extension_get_status, extension_install_native_host,
    extension_next_pending_request, extension_reset_connection, extension_revoke_extension,
    extension_verify_native_host, start_desktop_ipc, ExtensionBridgeState,
};

pub fn native_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = native_context();
    let isolated = acceptance::root_for_identifier(&context.config().identifier)
        .expect("Native isolation preflight failed")
        .is_some();
    if isolated {
        acceptance::configure_window_isolation(context.config_mut())
            .expect("WebView isolation preflight failed");
        let test_bridge = acceptance_bridge::TestBridge::default();
        tauri::Builder::default()
            .manage(test_bridge.clone())
            .manage(transactions::TransactionState::default())
            .setup(move |app| {
                let root = acceptance::root_for_identifier(&app.config().identifier)?
                    .ok_or("Missing acceptance root")?;
                acceptance::validate_application_paths(app.handle(), &root)?;
                acceptance_bridge::start(app.handle(), test_bridge.clone())?;
                let environment = acceptance::acceptance_environment(app.handle().clone())?
                    .ok_or("Missing isolated environment")?;
                eprintln!(
                    "ISOLATION_PREFLIGHT {}",
                    serde_json::to_string(&environment)?
                );
                Ok(())
            })
            // No Keychain, OpenAI, live discovery, filesystem, opener or bridge handlers.
            .invoke_handler(tauri::generate_handler![
                transactions::transaction_begin,
                transactions::transaction_query,
                transactions::transaction_finish,
                acceptance_bridge::acceptance_bridge_next,
                acceptance_bridge::acceptance_bridge_complete,
                acceptance_bridge::acceptance_resume_file,
                extension_bridge::resume_pdf_snapshot,
                acceptance::acceptance_environment,
                acceptance::acceptance_artifact,
                acceptance::acceptance_query,
                render_resume_latex
            ])
            .run(context)
            .expect("Acceptance application failed");
        return;
    }
    let extension_bridge_state = ExtensionBridgeState::default();
    tauri::Builder::default()
        .manage(transactions::TransactionState::default())
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
            transactions::transaction_begin,
            transactions::transaction_query,
            transactions::transaction_finish,
            acceptance::acceptance_environment,
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
            write_generated_resume_pdf,
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
            extension_authorize_resume_file,
            extension_bridge::resume_pdf_snapshot,
            fetch_public_job_board
        ])
        .run(context)
        .expect("error while running Tauri application");
}
