// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if career_compiler_lib::extension_bridge::should_run_as_native_host() {
        // The synthetic bundle must never bypass preflight through production host mode.
        let context = career_compiler_lib::native_context();
        if context.config().identifier == career_compiler_lib::acceptance::IDENTIFIER
            || std::env::var_os("CC_ACCEPTANCE_ROOT").is_some()
            || std::env::var_os("CC_ACCEPTANCE_BRIDGE").is_some()
        {
            eprintln!("Isolated acceptance requires its separate test-only native host.");
            std::process::exit(2);
        }
        std::process::exit(career_compiler_lib::extension_bridge::run_native_host_from_stdio());
    }
    career_compiler_lib::run();
}
