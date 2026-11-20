//! Explicit, fail-closed native acceptance boundary. No production path fallback.
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub const IDENTIFIER: &str = "com.mirathfan.careercompiler.acceptance";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptanceEnvironment {
    pub root: String,
    pub database_url: String,
    pub app_config_dir: String,
    pub ui_mode: bool,
    pub jobs_feed: bool,
    pub bridge_mode: bool,
    pub process_id: u32,
    pub window_geometry: Option<serde_json::Value>,
    pub budget_probe: Option<String>,
    pub interrupt_probe: bool,
}

fn validate_root(root: &Path) -> Result<PathBuf, String> {
    let canonical = root
        .canonicalize()
        .map_err(|_| "Acceptance root must already exist.")?;
    let temp = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| "Temporary directory unavailable.")?;
    if canonical.parent() != Some(temp.as_path())
        || !canonical
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with("careercompiler-native-"))
        || std::fs::read_to_string(canonical.join("ISOLATED_ACCEPTANCE")).unwrap_or_default()
            != "synthetic-only\n"
    {
        return Err(
            "Acceptance root must be a marked direct child of the temporary directory.".into(),
        );
    }
    Ok(canonical)
}

const PRODUCTION_IDENTIFIER: &str = "com.mirathfan.careercompiler";

fn configured_identity_valid(identity: &str) -> bool {
    identity == IDENTIFIER
        || identity
            .strip_prefix(&format!("{IDENTIFIER}.run"))
            .is_some_and(|suffix| {
                suffix.len() == 32
                    && suffix
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            })
}

// The runtime cannot select an identity: it must match the exact debug-build pin.
fn validate_identity(
    identifier: &str,
    compiled: Option<&str>,
    runtime: Option<&str>,
    active: bool,
) -> Result<bool, String> {
    match compiled {
        None if identifier == PRODUCTION_IDENTIFIER && !active => Ok(false),
        Some(expected)
            if configured_identity_valid(expected)
                && identifier == expected
                && runtime == Some(expected) =>
        {
            Ok(true)
        }
        _ => Err("Missing, unknown, production, or mismatched acceptance identity.".into()),
    }
}

fn validate_runtime_paths(root: &Path, identity: &str, home: Option<&Path>) -> Result<(), String> {
    for marker in ["ISOLATED_ACCEPTANCE", "ACCEPTANCE_ID"] {
        if !root
            .join(marker)
            .symlink_metadata()
            .is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
        {
            return Err("Acceptance markers must be regular nonsymbolic files.".into());
        }
    }
    if std::fs::read_to_string(root.join("ACCEPTANCE_ID")).unwrap_or_default()
        != format!("{identity}\n")
    {
        return Err("Synthetic root identity does not match the acceptance build.".into());
    }
    let expected = root.join("runtime-home");
    if home != Some(expected.as_path())
        || expected.canonicalize().ok().as_deref() != Some(expected.as_path())
    {
        return Err("Acceptance requires its dedicated nonsymbolic runtime home.".into());
    }
    for name in [
        "native.sqlite3",
        "native.sqlite3-wal",
        "native.sqlite3-shm",
        "native.sqlite3-journal",
    ] {
        if root
            .join(name)
            .symlink_metadata()
            .is_ok_and(|m| !m.is_file() || m.file_type().is_symlink())
        {
            return Err(
                "Synthetic database and sidecars must be regular nonsymbolic files.".into(),
            );
        }
    }
    Ok(())
}

fn validated_root(
    root: Option<&Path>,
    identity: &str,
    home: Option<&Path>,
) -> Result<PathBuf, String> {
    let root = validate_root(root.ok_or("Acceptance configuration requires CC_ACCEPTANCE_ROOT.")?)?;
    validate_runtime_paths(&root, identity, home)?;
    Ok(root)
}

pub fn root_for_identifier(identifier: &str) -> Result<Option<PathBuf>, String> {
    let root = std::env::var_os("CC_ACCEPTANCE_ROOT");
    let runtime = std::env::var("CC_ACCEPTANCE_ID").ok();
    let active =
        std::env::vars_os().any(|(key, _)| key.to_string_lossy().starts_with("CC_ACCEPTANCE_"));
    let compiled = if cfg!(debug_assertions) {
        option_env!("CC_ACCEPTANCE_BUILD_ID")
    } else {
        None
    };
    if !validate_identity(identifier, compiled, runtime.as_deref(), active)? {
        return Ok(None);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    validated_root(root.as_deref().map(Path::new), identifier, home.as_deref()).map(Some)
}

// Tauri 2.9.3 codegen emits Vec<u8> for this array-valued JSON field.
// Assign through the typed API, only after the exact acceptance guard succeeds.
pub fn configure_window_isolation(config: &mut tauri::Config) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    if !configured_identity_valid(&config.identifier) || config.app.windows.len() != 1 {
        return Err("Acceptance requires one isolated window.".into());
    }
    let store: [u8; 16] = Sha256::digest(config.identifier.as_bytes())[..16]
        .try_into()
        .unwrap();
    if config.app.windows[0]
        .data_store_identifier
        .is_some_and(|existing| existing != store)
    {
        return Err("Acceptance WebView store does not match its identity.".into());
    }
    config.app.windows[0].data_store_identifier = Some(store);
    validate_window_isolation(config)
}

// Called before constructing any WebView. Never inherit an existing WKWebView store.
pub fn validate_window_isolation(config: &tauri::Config) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(config.identifier.as_bytes());
    let mut store = [0u8; 16];
    store.copy_from_slice(&digest[..16]);
    if config.app.windows.len() != 1 || config.app.windows[0].data_store_identifier != Some(store) {
        return Err("Acceptance requires the identity-specific WebView data store.".into());
    }
    Ok(())
}

fn application_path_is_isolated(path: &Path, home: &Path) -> bool {
    path.starts_with(home) && path.canonicalize().ok().as_deref() == Some(path)
}

// Checked in native setup before any repository/database initialization.
pub fn validate_application_paths(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let home = root.join("runtime-home");
    for path in [
        app.path().app_config_dir(),
        app.path().app_data_dir(),
        app.path().app_cache_dir(),
    ] {
        let path = path.map_err(|e| e.to_string())?;
        if !application_path_is_isolated(&path, &home) {
            return Err(
                "Acceptance application paths must exist inside its dedicated runtime home.".into(),
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub fn acceptance_environment(
    app: tauri::AppHandle,
) -> Result<Option<AcceptanceEnvironment>, String> {
    let Some(root) = root_for_identifier(&app.config().identifier)? else {
        return Ok(None);
    };
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    // Measure the actual native window; do not infer points from config or PNG pixels.
    let window_geometry = app.get_webview_window("main").and_then(|window| {
        let inner = window.inner_size().ok()?;
        let outer = window.outer_size().ok()?;
        let scale = window.scale_factor().ok()?;
        Some(serde_json::json!({
            "source": "native-window-api",
            "scaleFactor": scale,
            "innerPhysical": { "width": inner.width, "height": inner.height },
            "outerPhysical": { "width": outer.width, "height": outer.height },
            "innerPoints": { "width": f64::from(inner.width) / scale, "height": f64::from(inner.height) / scale },
            "outerPoints": { "width": f64::from(outer.width) / scale, "height": f64::from(outer.height) / scale }
        }))
    });
    Ok(Some(AcceptanceEnvironment {
        window_geometry,
        process_id: std::process::id(),
        interrupt_probe: std::env::var("CC_ACCEPTANCE_INTERRUPT_PROBE").as_deref() == Ok("1"),
        budget_probe: std::env::var("CC_ACCEPTANCE_BUDGET_PROBE")
            .ok()
            .filter(|value| ["1", "2"].contains(&value.as_str())),
        bridge_mode: std::env::var("CC_ACCEPTANCE_BRIDGE").as_deref() == Ok("1"),
        jobs_feed: std::env::var("CC_ACCEPTANCE_JOBS_FEED").as_deref() == Ok("1"),
        ui_mode: std::env::var("CC_ACCEPTANCE_UI").as_deref() == Ok("1"),
        database_url: format!("sqlite:{}", root.join("native.sqlite3").display()),
        root: root.to_string_lossy().into_owned(),
        app_config_dir: app_config_dir.to_string_lossy().into_owned(),
    }))
}

#[tauri::command]
pub fn acceptance_artifact(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let root = root_for_identifier(&app.config().identifier)?.ok_or("Acceptance mode required.")?;
    if ![
        "stage-one.json",
        "stage-two.json",
        "resume-a.pdf",
        "resume-b.pdf",
        "budget-probe-1.json",
        "budget-probe-2.json",
        "interrupt-ready.json",
        "ui-startup.json",
        "jobs-feed.json",
        "bridge-ready.json",
    ]
    .contains(&name.as_str())
        || bytes.len() > 2_000_000
    {
        return Err("Acceptance artifact is not allowlisted or is too large.".into());
    }
    let path = root.join(name);
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Acceptance artifact cannot be a symlink.".into());
    }
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    const UNIQUE: &str =
        "com.mirathfan.careercompiler.acceptance.run0123456789abcdef0123456789abcdef";

    #[test]
    fn identity_requires_exact_debug_build_and_runtime_pins() {
        for id in [IDENTIFIER, UNIQUE] {
            assert_eq!(validate_identity(id, Some(id), Some(id), true), Ok(true));
            assert!(validate_identity(id, None, Some(id), true).is_err());
            assert!(validate_identity(id, Some(id), None, true).is_err());
        }
        assert_eq!(
            validate_identity(PRODUCTION_IDENTIFIER, None, None, false),
            Ok(false)
        );
        for (id, build, runtime) in [
            (PRODUCTION_IDENTIFIER, Some(UNIQUE), Some(UNIQUE)),
            (PRODUCTION_IDENTIFIER, None, Some(UNIQUE)),
            ("unknown", None, None),
            (UNIQUE, Some(IDENTIFIER), Some(UNIQUE)),
            (UNIQUE, Some(UNIQUE), Some(IDENTIFIER)),
            ("", Some(UNIQUE), Some(UNIQUE)),
            (
                "com.mirathfan.careercompiler.acceptance.run*",
                Some("com.mirathfan.careercompiler.acceptance.run*"),
                Some("com.mirathfan.careercompiler.acceptance.run*"),
            ),
        ] {
            assert!(validate_identity(id, build, runtime, true).is_err());
        }
    }

    #[test]
    fn identity_root_and_home_fail_before_database_creation() {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "careercompiler-native-identity-{}",
            rand::random::<u64>()
        ));
        std::fs::create_dir(&root).unwrap();
        let home = root.join("runtime-home");
        std::fs::create_dir(&home).unwrap();
        assert!(validated_root(None, UNIQUE, Some(&home)).is_err());
        assert!(validated_root(Some(&root), UNIQUE, Some(&home)).is_err());
        std::fs::write(root.join("ISOLATED_ACCEPTANCE"), "synthetic-only\n").unwrap();
        assert!(validated_root(Some(&root), UNIQUE, Some(&home)).is_err());
        std::fs::write(root.join("ACCEPTANCE_ID"), format!("{UNIQUE}\n")).unwrap();
        assert!(validated_root(Some(&root), UNIQUE, None).is_err());
        assert!(validated_root(Some(&root), UNIQUE, Some(Path::new("/Users/athfan"))).is_err());
        assert!(validated_root(Some(&root), IDENTIFIER, Some(&home)).is_err());
        assert!(validated_root(Some(&home), UNIQUE, Some(&home)).is_err());
        assert!(validated_root(Some(&root), UNIQUE, Some(&home)).is_ok());
        assert!(!root.join("native.sqlite3").exists());
        assert!(application_path_is_isolated(&home, &home));
        assert!(!application_path_is_isolated(
            Path::new("/Users/athfan/Library/Application Support/com.mirathfan.careercompiler"),
            &home
        ));
        std::fs::write(root.join("unrelated-fixture"), "preserved").unwrap();
        std::os::unix::fs::symlink(root.join("unrelated-fixture"), root.join("native.sqlite3"))
            .unwrap();
        assert!(validated_root(Some(&root), UNIQUE, Some(&home)).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("unrelated-fixture")).unwrap(),
            "preserved"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn webview_store_must_match_the_exact_identity() {
        use sha2::{Digest, Sha256};
        let mut config = tauri::Config {
            identifier: UNIQUE.into(),
            ..Default::default()
        };
        config.app.windows = vec![Default::default()];
        assert!(validate_window_isolation(&config).is_err());
        config.app.windows[0].data_store_identifier =
            Some(Sha256::digest(UNIQUE.as_bytes())[..16].try_into().unwrap());
        assert!(validate_window_isolation(&config).is_ok());
        config.identifier = IDENTIFIER.into();
        assert!(validate_window_isolation(&config).is_err());
        assert!(configure_window_isolation(&mut config).is_err());
        config.app.windows[0].data_store_identifier = None;
        configure_window_isolation(&mut config).unwrap();
        assert!(validate_window_isolation(&config).is_ok());
        config.identifier = PRODUCTION_IDENTIFIER.into();
        assert!(configure_window_isolation(&mut config).is_err());
    }

    #[test]
    fn rejects_file_access_sql() {
        for query in [
            "ATTACH DATABASE '/unsafe/path' AS real",
            "VACUUM INTO '/unsafe/path'",
            "SELECT load_extension('x')",
            "PRAGMA temp_store_directory='/unsafe/path'",
        ] {
            assert!(validate_query(query).is_err());
        }
        assert!(validate_query("SELECT * FROM jobs WHERE id = $1").is_ok());
    }
    #[test]
    fn accepts_only_marked_temporary_roots() {
        let root =
            std::env::temp_dir().join(format!("careercompiler-native-unit-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        assert!(validate_root(&root).is_err());
        std::fs::write(root.join("ISOLATED_ACCEPTANCE"), "synthetic-only\n").unwrap();
        assert!(validate_root(&root).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn decodes_native_sqlite_runtime_types() {
        tauri::async_runtime::block_on(async {
            use sqlx::Connection;
            let mut connection = sqlx::SqliteConnection::connect("sqlite::memory:")
                .await
                .unwrap();
            let rows = sqlx::query("SELECT 7 AS integer_value, 1.5 AS real_value, NULL AS empty_value, 'synthetic' AS text_value")
                .fetch_all(&mut connection).await.unwrap();
            assert_eq!(
                decode_rows(rows).unwrap(),
                serde_json::json!([{"integer_value":7,"real_value":1.5,"empty_value":null,"text_value":"synthetic"}])
            );
        });
    }
    #[test]
    fn rejects_unmarked_paths() {
        assert!(validate_root(&std::env::temp_dir()).is_err());
        assert!(validate_root(Path::new("/does-not-exist")).is_err());
    }
}

// The upstream SQL plugin does not enforce its configured db scope in load() and
// accepts arbitrary paths. Do not install it in acceptance mode. Use a fixed-path
// native SQLite transport for the same frontend repository instead.
pub(crate) fn validate_query(query: &str) -> Result<(), String> {
    let upper = query.to_uppercase();
    if [
        "ATTACH",
        "DETACH",
        "VACUUM",
        "LOAD_EXTENSION",
        "TEMP_STORE_DIRECTORY",
        "DATA_STORE_DIRECTORY",
    ]
    .iter()
    .any(|token| upper.contains(token))
    {
        return Err("File-access SQL is forbidden in acceptance mode.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn acceptance_query(
    app: tauri::AppHandle,
    query: String,
    values: Vec<serde_json::Value>,
    select: bool,
) -> Result<serde_json::Value, String> {
    use sqlx::Connection;
    validate_query(&query)?;
    let root = root_for_identifier(&app.config().identifier)?.ok_or("Acceptance mode required.")?;
    let path = root.join("native.sqlite3");
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Database cannot be a symlink.".into());
    }
    let mut connection =
        sqlx::SqliteConnection::connect(&format!("sqlite:{}?mode=rwc", path.display()))
            .await
            .map_err(|error| error.to_string())?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    query_connection(&mut connection, query, values, select).await
}

pub(crate) async fn query_connection(
    connection: &mut sqlx::SqliteConnection,
    query: String,
    values: Vec<serde_json::Value>,
    select: bool,
) -> Result<serde_json::Value, String> {
    let mut statement = sqlx::query(&query);
    for value in values {
        statement = match value {
            serde_json::Value::Null => statement.bind(None::<String>),
            serde_json::Value::String(value) => statement.bind(value),
            serde_json::Value::Number(value) => {
                if let Some(value) = value.as_i64() {
                    statement.bind(value)
                } else {
                    statement.bind(value.as_f64().unwrap_or_default())
                }
            }
            serde_json::Value::Bool(value) => statement.bind(value),
            value => statement.bind(value.to_string()),
        };
    }
    if !select {
        let result = statement
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(
            serde_json::json!({"rowsAffected": result.rows_affected(), "lastInsertId": result.last_insert_rowid()}),
        );
    }
    let rows = statement
        .fetch_all(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    decode_rows(rows)
}

fn decode_rows(rows: Vec<sqlx::sqlite::SqliteRow>) -> Result<serde_json::Value, String> {
    use sqlx::{Row, TypeInfo, ValueRef};
    let mut output = Vec::new();
    for row in rows {
        let mut object = serde_json::Map::new();
        for (index, column) in row.columns().iter().enumerate() {
            use sqlx::Column;
            let raw = row.try_get_raw(index).map_err(|error| error.to_string())?;
            if raw.is_null() {
                object.insert(column.name().to_string(), serde_json::Value::Null);
                continue;
            }
            let value = match raw.type_info().name() {
                "INTEGER" => serde_json::to_value(
                    row.try_get::<Option<i64>, _>(index)
                        .map_err(|error| error.to_string())?,
                ),
                "REAL" => serde_json::to_value(
                    row.try_get::<Option<f64>, _>(index)
                        .map_err(|error| error.to_string())?,
                ),
                _ => serde_json::to_value(
                    row.try_get::<Option<String>, _>(index)
                        .map_err(|error| error.to_string())?,
                ),
            }
            .map_err(|error| error.to_string())?;
            object.insert(column.name().to_string(), value);
        }
        output.push(serde_json::Value::Object(object));
    }
    Ok(serde_json::Value::Array(output))
}
