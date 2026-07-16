// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if career_compiler_lib::extension_bridge::should_run_as_native_host() {
        std::process::exit(career_compiler_lib::extension_bridge::run_native_host_from_stdio());
    }
    career_compiler_lib::run();
}
