//! Opt-in maintenance executable. Never launches the desktop application.
fn main() {
    match career_compiler_lib::migration012::invoke(std::env::args().skip(1).collect()) {
        Ok(output) => println!("{output}"),
        Err(code) => {
            eprintln!("{code}");
            std::process::exit(2);
        }
    }
}
