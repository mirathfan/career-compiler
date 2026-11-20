fn main() {
    println!("cargo:rerun-if-env-changed=CC_ACCEPTANCE_BUILD_ID");
    if let Ok(identity) = std::env::var("CC_ACCEPTANCE_BUILD_ID") {
        let legacy = "com.mirathfan.careercompiler.acceptance";
        let valid = identity == legacy
            || identity
                .strip_prefix(&format!("{legacy}.run"))
                .is_some_and(|s| {
                    s.len() == 32
                        && s.bytes()
                            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                });
        assert!(
            std::env::var("PROFILE").as_deref() == Ok("debug") && valid,
            "Acceptance identity requires an explicitly pinned debug build"
        );
        println!("cargo:rustc-env=CC_ACCEPTANCE_BUILD_ID={identity}");
    }
    tauri_build::build()
}
