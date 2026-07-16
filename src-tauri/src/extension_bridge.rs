use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};

pub const NATIVE_HOST_NAME: &str = "com.mirathfan.careercompiler";
pub const PROTOCOL_VERSION: u64 = 1;

const MAX_CHROME_MESSAGE_BYTES: u32 = 1024 * 1024;
const MAX_IPC_MESSAGE_BYTES: u32 = 2 * 1024 * 1024;
const DESKTOP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const VERIFY_TIMEOUT: Duration = Duration::from_secs(5);
const PAIRING_CODE_TTL: Duration = Duration::from_secs(10 * 60);
const SMALL_FILE_INLINE_LIMIT: u64 = 700 * 1024;

#[derive(Clone, Default)]
pub struct ExtensionBridgeState {
    inner: Arc<BridgeInner>,
}

#[derive(Default)]
struct BridgeInner {
    pending: Mutex<VecDeque<PendingExtensionRequest>>,
    inflight: Mutex<HashMap<String, Arc<PendingExchange>>>,
    pairing_code: Mutex<Option<PairingCode>>,
    diagnostics: Mutex<VecDeque<DiagnosticEvent>>,
}

struct PendingExchange {
    response: Mutex<Option<Value>>,
    ready: Condvar,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingExtensionRequest {
    pub bridge_request_id: String,
    pub received_at_ms: u128,
    pub request: Value,
}

#[derive(Clone)]
struct PairingCode {
    code: String,
    extension_id: Option<String>,
    expires_at_ms: u128,
    used: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub at_ms: u128,
    pub level: String,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ConnectionConfig {
    protocol_version: u64,
    authorized_extension_ids: Vec<String>,
    paired_extension_id: String,
    credential_hash: String,
    updated_at_ms: u128,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostEnvelope {
    origin: String,
    request: Value,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtocolError {
    code: String,
    message: String,
    retryable: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    protocol_version: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProtocolError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionBridgeStatus {
    pub native_host_name: String,
    pub protocol_version: u64,
    pub app_support_dir: String,
    pub socket_path: String,
    pub manifest_path: String,
    pub installed_host_path: String,
    pub manifest_exists: bool,
    pub manifest_valid: bool,
    pub host_binary_exists: bool,
    pub host_binary_executable: bool,
    pub configured_extension_ids: Vec<String>,
    pub paired_extension_id: String,
    pub setup_state: String,
    pub ping_ok: bool,
    pub ping_error: String,
    pub diagnostics: Vec<DiagnosticEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeResult {
    pub pairing_code: String,
    pub expires_at_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizedResumeFile {
    pub authorized_file_reference: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub expires_at_ms: u128,
    pub file_base64: Option<String>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn home_dir() -> Result<PathBuf, String> {
    env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
        "home_missing|Could not resolve the current user's home directory.".to_string()
    })
}

pub fn app_support_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join("Library")
        .join("Application Support")
        .join("CareerCompiler"))
}

fn native_host_dir() -> Result<PathBuf, String> {
    Ok(app_support_dir()?.join("NativeHost"))
}

fn extension_dir() -> Result<PathBuf, String> {
    Ok(app_support_dir()?.join("Extension"))
}

fn socket_dir() -> Result<PathBuf, String> {
    Ok(app_support_dir()?.join("IPC"))
}

fn authorized_exports_dir() -> Result<PathBuf, String> {
    Ok(app_support_dir()?.join("AuthorizedResumeExports"))
}

fn socket_path() -> Result<PathBuf, String> {
    Ok(socket_dir()?.join("native-host.sock"))
}

fn connection_config_path() -> Result<PathBuf, String> {
    Ok(extension_dir()?.join("connection.json"))
}

fn installed_host_path() -> Result<PathBuf, String> {
    Ok(native_host_dir()?.join("careercompiler-native-host"))
}

fn chrome_manifest_path() -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join("Library")
        .join("Application Support")
        .join("Google")
        .join("Chrome")
        .join("NativeMessagingHosts")
        .join(format!("{NATIVE_HOST_NAME}.json")))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "path_parent_missing|Could not resolve target directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("create_dir_failed|{error}"))
}

fn random_token(byte_len: usize) -> String {
    let mut bytes = vec![0_u8; byte_len];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn random_pairing_code() -> String {
    let mut bytes = [0_u8; 4];
    rand::rng().fill_bytes(&mut bytes);
    let value = u32::from_le_bytes(bytes) % 1_000_000;
    format!("{value:06}")
}

fn sha256_hex(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn request_id(request: &Value) -> Option<String> {
    request
        .get("requestId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToString::to_string)
}

fn response_ok(request_id: Option<String>, data: Value) -> Value {
    serde_json::to_value(ExtensionResponse {
        ok: true,
        request_id,
        protocol_version: PROTOCOL_VERSION,
        data: Some(data),
        error: None,
    })
    .unwrap_or_else(|_| json!({ "ok": true, "protocolVersion": PROTOCOL_VERSION }))
}

fn response_error(request_id: Option<String>, code: &str, message: &str, retryable: bool) -> Value {
    serde_json::to_value(ExtensionResponse {
        ok: false,
        request_id,
        protocol_version: PROTOCOL_VERSION,
        data: None,
        error: Some(ProtocolError {
            code: code.to_string(),
            message: message.to_string(),
            retryable,
        }),
    })
    .unwrap_or_else(|_| json!({ "ok": false, "protocolVersion": PROTOCOL_VERSION }))
}

fn sanitize_diagnostic(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .collect::<String>()
        .chars()
        .take(240)
        .collect()
}

fn push_diagnostic(state: &ExtensionBridgeState, level: &str, code: &str, message: &str) {
    let mut diagnostics = state
        .inner
        .diagnostics
        .lock()
        .expect("diagnostics mutex poisoned");
    diagnostics.push_back(DiagnosticEvent {
        at_ms: now_ms(),
        level: level.to_string(),
        code: code.to_string(),
        message: sanitize_diagnostic(message),
    });
    while diagnostics.len() > 40 {
        diagnostics.pop_front();
    }
}

pub fn valid_extension_id(extension_id: &str) -> bool {
    extension_id.len() == 32
        && extension_id
            .chars()
            .all(|character| matches!(character, 'a'..='p'))
}

fn extension_id_from_origin(origin: &str) -> Option<String> {
    origin
        .strip_prefix("chrome-extension://")
        .and_then(|rest| rest.strip_suffix('/').or(Some(rest)))
        .filter(|candidate| valid_extension_id(candidate))
        .map(ToString::to_string)
}

fn default_config() -> ConnectionConfig {
    ConnectionConfig {
        protocol_version: PROTOCOL_VERSION,
        authorized_extension_ids: vec![],
        paired_extension_id: String::new(),
        credential_hash: String::new(),
        updated_at_ms: now_ms(),
    }
}

fn load_config() -> Result<ConnectionConfig, String> {
    let path = connection_config_path()?;
    if !path.exists() {
        return Ok(default_config());
    }
    let text = fs::read_to_string(path).map_err(|error| format!("config_read_failed|{error}"))?;
    let mut config: ConnectionConfig =
        serde_json::from_str(&text).map_err(|error| format!("config_invalid|{error}"))?;
    if config.protocol_version == 0 {
        config.protocol_version = PROTOCOL_VERSION;
    }
    Ok(config)
}

fn write_config(config: &ConnectionConfig) -> Result<(), String> {
    let path = connection_config_path()?;
    ensure_parent(&path)?;
    let temp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(config)
        .map_err(|error| format!("config_encode_failed|{error}"))?;
    fs::write(&temp, text).map_err(|error| format!("config_write_failed|{error}"))?;
    #[cfg(unix)]
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("config_permission_failed|{error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("config_replace_failed|{error}"))
}

fn write_manifest(extension_ids: &[String]) -> Result<(), String> {
    let path = chrome_manifest_path()?;
    ensure_parent(&path)?;
    let origins: Vec<String> = extension_ids
        .iter()
        .filter(|extension_id| valid_extension_id(extension_id))
        .map(|extension_id| format!("chrome-extension://{extension_id}/"))
        .collect();
    if origins.is_empty() {
        return Err("extension_id_missing|A valid Chrome extension ID is required.".to_string());
    }
    let manifest = json!({
        "name": NATIVE_HOST_NAME,
        "description": "CareerCompiler native messaging host",
        "path": installed_host_path()?.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": origins,
    });
    let temp = path.with_extension("json.tmp");
    fs::write(
        &temp,
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("manifest_encode_failed|{error}"))?,
    )
    .map_err(|error| format!("manifest_write_failed|{error}"))?;
    #[cfg(unix)]
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o644))
        .map_err(|error| format!("manifest_permission_failed|{error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("manifest_replace_failed|{error}"))
}

fn install_host_binary() -> Result<(), String> {
    let source = env::current_exe().map_err(|error| format!("current_exe_failed|{error}"))?;
    let target = installed_host_path()?;
    ensure_parent(&target)?;
    let temp = target.with_extension("tmp");
    fs::copy(&source, &temp).map_err(|error| format!("host_copy_failed|{error}"))?;
    #[cfg(unix)]
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o755))
        .map_err(|error| format!("host_permission_failed|{error}"))?;
    fs::rename(&temp, &target).map_err(|error| format!("host_replace_failed|{error}"))
}

fn manifest_is_valid_for(extension_id: Option<&str>) -> bool {
    let Ok(path) = chrome_manifest_path() else {
        return false;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(manifest) = serde_json::from_str::<Value>(&text) else {
        return false;
    };
    if manifest.get("name").and_then(Value::as_str) != Some(NATIVE_HOST_NAME) {
        return false;
    }
    if manifest.get("type").and_then(Value::as_str) != Some("stdio") {
        return false;
    }
    if manifest.get("path").and_then(Value::as_str).is_none() {
        return false;
    }
    match extension_id {
        Some(extension_id) => manifest
            .get("allowed_origins")
            .and_then(Value::as_array)
            .map(|origins| {
                origins.iter().any(|origin| {
                    origin.as_str() == Some(&format!("chrome-extension://{extension_id}/"))
                })
            })
            .unwrap_or(false),
        None => true,
    }
}

fn host_binary_executable(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    #[cfg(unix)]
    {
        fs::metadata(path)
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn setup_state(
    manifest_exists: bool,
    manifest_valid: bool,
    host_binary_exists: bool,
    host_binary_executable: bool,
    config: &ConnectionConfig,
) -> String {
    if !host_binary_exists || !host_binary_executable {
        "not_registered".to_string()
    } else if !manifest_exists || !manifest_valid {
        "installed_but_not_registered".to_string()
    } else if config.paired_extension_id.is_empty() || config.credential_hash.is_empty() {
        "registered_but_not_paired".to_string()
    } else {
        "paired_and_connected".to_string()
    }
}

fn build_status(state: &ExtensionBridgeState, extension_id: Option<&str>) -> ExtensionBridgeStatus {
    let config = load_config().unwrap_or_else(|_| default_config());
    let manifest_path = chrome_manifest_path().unwrap_or_else(|_| PathBuf::new());
    let host_path = installed_host_path().unwrap_or_else(|_| PathBuf::new());
    let manifest_exists = manifest_path.exists();
    let manifest_valid = manifest_is_valid_for(extension_id);
    let host_binary_exists = host_path.exists();
    let host_binary_executable = host_binary_executable(&host_path);
    let diagnostics = state
        .inner
        .diagnostics
        .lock()
        .expect("diagnostics mutex poisoned")
        .iter()
        .cloned()
        .collect();
    ExtensionBridgeStatus {
        native_host_name: NATIVE_HOST_NAME.to_string(),
        protocol_version: PROTOCOL_VERSION,
        app_support_dir: app_support_dir()
            .unwrap_or_else(|_| PathBuf::new())
            .to_string_lossy()
            .to_string(),
        socket_path: socket_path()
            .unwrap_or_else(|_| PathBuf::new())
            .to_string_lossy()
            .to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        installed_host_path: host_path.to_string_lossy().to_string(),
        manifest_exists,
        manifest_valid,
        host_binary_exists,
        host_binary_executable,
        configured_extension_ids: config.authorized_extension_ids.clone(),
        paired_extension_id: config.paired_extension_id.clone(),
        setup_state: setup_state(
            manifest_exists,
            manifest_valid,
            host_binary_exists,
            host_binary_executable,
            &config,
        ),
        ping_ok: false,
        ping_error: String::new(),
        diagnostics,
    }
}

#[tauri::command]
pub fn extension_get_status(
    state: tauri::State<'_, ExtensionBridgeState>,
    extension_id: Option<String>,
) -> Result<ExtensionBridgeStatus, String> {
    Ok(build_status(&state, extension_id.as_deref()))
}

#[tauri::command]
pub fn extension_install_native_host(
    state: tauri::State<'_, ExtensionBridgeState>,
    extension_id: String,
) -> Result<ExtensionBridgeStatus, String> {
    if !valid_extension_id(&extension_id) {
        return Err(
            "extension_id_invalid|Chrome extension IDs must be 32 lowercase a-p characters."
                .to_string(),
        );
    }
    install_host_binary()?;
    let mut config = load_config().unwrap_or_else(|_| default_config());
    if !config.authorized_extension_ids.contains(&extension_id) {
        config.authorized_extension_ids.push(extension_id.clone());
    }
    config.protocol_version = PROTOCOL_VERSION;
    config.updated_at_ms = now_ms();
    write_config(&config)?;
    write_manifest(&config.authorized_extension_ids)?;
    push_diagnostic(
        &state,
        "info",
        "native_host_installed",
        "Installed Chrome native messaging host.",
    );
    Ok(build_status(&state, Some(&extension_id)))
}

#[tauri::command]
pub fn extension_verify_native_host(
    state: tauri::State<'_, ExtensionBridgeState>,
    extension_id: Option<String>,
) -> Result<ExtensionBridgeStatus, String> {
    let extension_id = extension_id
        .or_else(|| {
            load_config()
                .ok()
                .and_then(|config| config.authorized_extension_ids.first().cloned())
        })
        .ok_or_else(|| {
            "extension_id_missing|Register a Chrome extension ID before verification.".to_string()
        })?;
    if !valid_extension_id(&extension_id) {
        return Err(
            "extension_id_invalid|Chrome extension IDs must be 32 lowercase a-p characters."
                .to_string(),
        );
    }
    let mut status = build_status(&state, Some(&extension_id));
    if !status.host_binary_executable || !status.manifest_valid {
        status.ping_error = "Native host binary or manifest is not ready.".to_string();
        return Ok(status);
    }
    match ping_installed_host(&extension_id) {
        Ok(()) => {
            status.ping_ok = true;
            status.ping_error = String::new();
            push_diagnostic(
                &state,
                "info",
                "native_host_ping_ok",
                "Native host ping succeeded.",
            );
        }
        Err(error) => {
            status.ping_error = error;
            push_diagnostic(
                &state,
                "warn",
                "native_host_ping_failed",
                &status.ping_error,
            );
        }
    }
    Ok(status)
}

#[tauri::command]
pub fn extension_generate_pairing_code(
    state: tauri::State<'_, ExtensionBridgeState>,
    extension_id: Option<String>,
) -> Result<PairingCodeResult, String> {
    if let Some(extension_id) = extension_id.as_deref() {
        if !valid_extension_id(extension_id) {
            return Err(
                "extension_id_invalid|Chrome extension IDs must be 32 lowercase a-p characters."
                    .to_string(),
            );
        }
    }
    let code = random_pairing_code();
    let expires_at_ms = now_ms() + PAIRING_CODE_TTL.as_millis();
    let mut pairing = state
        .inner
        .pairing_code
        .lock()
        .expect("pairing mutex poisoned");
    *pairing = Some(PairingCode {
        code: code.clone(),
        extension_id,
        expires_at_ms,
        used: false,
    });
    push_diagnostic(
        &state,
        "info",
        "pairing_code_created",
        "Created a short-lived pairing code.",
    );
    Ok(PairingCodeResult {
        pairing_code: code,
        expires_at_ms,
    })
}

#[tauri::command]
pub fn extension_revoke_extension(
    state: tauri::State<'_, ExtensionBridgeState>,
) -> Result<ExtensionBridgeStatus, String> {
    let mut config = load_config().unwrap_or_else(|_| default_config());
    config.paired_extension_id.clear();
    config.credential_hash.clear();
    config.updated_at_ms = now_ms();
    write_config(&config)?;
    push_diagnostic(
        &state,
        "info",
        "extension_revoked",
        "Revoked the paired extension credential.",
    );
    Ok(build_status(&state, None))
}

#[tauri::command]
pub fn extension_reset_connection(
    state: tauri::State<'_, ExtensionBridgeState>,
) -> Result<ExtensionBridgeStatus, String> {
    let mut config = load_config().unwrap_or_else(|_| default_config());
    config.paired_extension_id.clear();
    config.credential_hash.clear();
    config.updated_at_ms = now_ms();
    write_config(&config)?;
    let mut pairing = state
        .inner
        .pairing_code
        .lock()
        .expect("pairing mutex poisoned");
    *pairing = None;
    push_diagnostic(
        &state,
        "info",
        "connection_reset",
        "Reset extension pairing state.",
    );
    Ok(build_status(&state, None))
}

#[tauri::command]
pub fn extension_next_pending_request(
    state: tauri::State<'_, ExtensionBridgeState>,
) -> Result<Option<PendingExtensionRequest>, String> {
    let mut pending = state.inner.pending.lock().expect("pending mutex poisoned");
    Ok(pending.pop_front())
}

#[tauri::command]
pub fn extension_complete_pending_request(
    state: tauri::State<'_, ExtensionBridgeState>,
    bridge_request_id: String,
    response: Value,
) -> Result<bool, String> {
    let exchange = {
        let inflight = state
            .inner
            .inflight
            .lock()
            .expect("inflight mutex poisoned");
        inflight.get(&bridge_request_id).cloned()
    };
    if let Some(exchange) = exchange {
        let mut slot = exchange.response.lock().expect("response mutex poisoned");
        *slot = Some(response);
        exchange.ready.notify_all();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn extension_authorize_resume_file(
    application_id: String,
    resume_version_id: String,
    path: String,
) -> Result<AuthorizedResumeFile, String> {
    let source = PathBuf::from(path);
    let source = source
        .canonicalize()
        .map_err(|error| format!("resume_path_invalid|{error}"))?;
    let metadata =
        fs::metadata(&source).map_err(|error| format!("resume_metadata_failed|{error}"))?;
    if !metadata.is_file() {
        return Err("resume_not_file|The selected resume path is not a regular file.".to_string());
    }
    if source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(true)
    {
        return Err(
            "resume_not_pdf|Only exported PDF resumes can be authorized for upload.".to_string(),
        );
    }
    cleanup_expired_exports().ok();
    let safe_application = safe_path_segment(&application_id);
    let safe_resume = safe_path_segment(&resume_version_id);
    let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .map(safe_filename)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "CareerCompiler_Resume.pdf".to_string());
    let export_dir = authorized_exports_dir()?.join(safe_application);
    fs::create_dir_all(&export_dir).map_err(|error| format!("resume_export_dir_failed|{error}"))?;
    let reference = format!("resume-{safe_resume}-{}", random_token(8));
    let target = export_dir.join(format!("{reference}-{filename}"));
    fs::copy(&source, &target).map_err(|error| format!("resume_export_failed|{error}"))?;
    #[cfg(unix)]
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("resume_export_permission_failed|{error}"))?;
    let size = fs::metadata(&target)
        .map_err(|error| format!("resume_export_metadata_failed|{error}"))?
        .len();
    let file_base64 = if size <= SMALL_FILE_INLINE_LIMIT {
        Some(BASE64.encode(
            fs::read(&target).map_err(|error| format!("resume_export_read_failed|{error}"))?,
        ))
    } else {
        None
    };
    Ok(AuthorizedResumeFile {
        authorized_file_reference: reference,
        filename,
        mime_type: "application/pdf".to_string(),
        size_bytes: size,
        expires_at_ms: now_ms() + Duration::from_secs(30 * 60).as_millis(),
        file_base64,
    })
}

fn safe_path_segment(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(80)
        .collect::<String>()
}

fn safe_filename(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ' ')
        })
        .take(120)
        .collect::<String>()
}

fn cleanup_expired_exports() -> Result<(), String> {
    let root = authorized_exports_dir()?;
    if !root.exists() {
        return Ok(());
    }
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(2 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    for entry in fs::read_dir(root).map_err(|error| format!("resume_cleanup_failed|{error}"))? {
        let entry = entry.map_err(|error| format!("resume_cleanup_entry_failed|{error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("resume_cleanup_metadata_failed|{error}"))?;
        if metadata.is_file() && metadata.modified().unwrap_or(SystemTime::now()) < cutoff {
            fs::remove_file(entry.path()).ok();
        }
    }
    Ok(())
}

pub fn start_desktop_ipc(state: ExtensionBridgeState) -> Result<(), String> {
    #[cfg(not(unix))]
    {
        let _ = state;
        return Err(
            "ipc_unsupported|Native messaging IPC is currently implemented for macOS.".to_string(),
        );
    }

    #[cfg(unix)]
    {
        let socket_path = socket_path()?;
        ensure_parent(&socket_path)?;
        if socket_path.exists() {
            fs::remove_file(&socket_path)
                .map_err(|error| format!("socket_stale_remove_failed|{error}"))?;
        }
        let listener = UnixListener::bind(&socket_path)
            .map_err(|error| format!("socket_bind_failed|{error}"))?;
        push_diagnostic(
            &state,
            "info",
            "ipc_started",
            "Started native host IPC listener.",
        );
        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let state = state.clone();
                        thread::spawn(move || handle_ipc_stream(state, stream));
                    }
                    Err(error) => {
                        push_diagnostic(&state, "warn", "ipc_accept_failed", &error.to_string());
                    }
                }
            }
        });
        Ok(())
    }
}

#[cfg(unix)]
fn handle_ipc_stream(state: ExtensionBridgeState, mut stream: UnixStream) {
    let response = match read_framed_json(&mut stream, MAX_IPC_MESSAGE_BYTES) {
        Ok(envelope) => handle_host_envelope(&state, envelope),
        Err(error) => response_error(None, "malformed_ipc", &error, false),
    };
    if let Err(error) = write_framed_json(&mut stream, &response, MAX_IPC_MESSAGE_BYTES) {
        push_diagnostic(&state, "warn", "ipc_write_failed", &error);
    }
}

fn handle_host_envelope(state: &ExtensionBridgeState, envelope: HostEnvelope) -> Value {
    let request = envelope.request;
    let request_id = request_id(&request);
    let protocol_version = request.get("protocolVersion").and_then(Value::as_u64);
    if protocol_version != Some(PROTOCOL_VERSION) {
        return response_error(
            request_id,
            "version_mismatch",
            "This CareerCompiler extension protocol version is not supported.",
            false,
        );
    }
    let message_type = request.get("type").and_then(Value::as_str).unwrap_or("");
    let origin_extension_id = match extension_id_from_origin(&envelope.origin) {
        Some(extension_id) => extension_id,
        None => {
            return response_error(
                request_id,
                "origin_invalid",
                "Chrome did not provide a valid extension origin.",
                false,
            )
        }
    };

    match message_type {
        "ping" => handle_ping(request_id, &origin_extension_id),
        "pair" => handle_pair(state, request_id, &origin_extension_id, &request),
        "prepare_application" | "save_application_edits" | "mark_filled" | "capture_job" => {
            if let Err(response) =
                validate_paired_request(request_id.clone(), &origin_extension_id, &request)
            {
                return response;
            }
            enqueue_desktop_request(state, request)
        }
        _ => response_error(
            request_id,
            "unknown_message_type",
            "CareerCompiler does not recognize this extension request type.",
            false,
        ),
    }
}

fn handle_ping(request_id: Option<String>, origin_extension_id: &str) -> Value {
    let config = load_config().unwrap_or_else(|_| default_config());
    response_ok(
        request_id,
        json!({
            "desktopAvailable": true,
            "nativeHostName": NATIVE_HOST_NAME,
            "extensionId": origin_extension_id,
            "paired": config.paired_extension_id == origin_extension_id && !config.credential_hash.is_empty(),
            "configuredExtensionIds": config.authorized_extension_ids,
        }),
    )
}

fn handle_pair(
    state: &ExtensionBridgeState,
    request_id: Option<String>,
    origin_extension_id: &str,
    request: &Value,
) -> Value {
    let extension_id = request
        .get("extensionId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if extension_id != origin_extension_id || !valid_extension_id(extension_id) {
        return response_error(
            request_id,
            "extension_id_mismatch",
            "The pairing request did not come from the expected Chrome extension.",
            false,
        );
    }
    let mut config = load_config().unwrap_or_else(|_| default_config());
    if !config
        .authorized_extension_ids
        .contains(&extension_id.to_string())
    {
        return response_error(
            request_id,
            "extension_not_registered",
            "Register this extension ID in CareerCompiler before pairing.",
            false,
        );
    }
    let supplied_code = request
        .get("pairingCode")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let mut pairing = state
        .inner
        .pairing_code
        .lock()
        .expect("pairing mutex poisoned");
    let Some(active) = pairing.as_mut() else {
        return response_error(
            request_id,
            "pairing_code_missing",
            "Generate a fresh pairing code in CareerCompiler.",
            true,
        );
    };
    if active.used || active.expires_at_ms < now_ms() {
        return response_error(
            request_id,
            "pairing_code_expired",
            "The pairing code expired. Generate a fresh code in CareerCompiler.",
            true,
        );
    }
    if active
        .extension_id
        .as_deref()
        .is_some_and(|expected| expected != extension_id)
        || active.code != supplied_code
    {
        return response_error(
            request_id,
            "pairing_code_invalid",
            "The pairing code did not match.",
            true,
        );
    }
    active.used = true;
    let credential = random_token(32);
    config.paired_extension_id = extension_id.to_string();
    config.credential_hash = sha256_hex(&credential);
    config.updated_at_ms = now_ms();
    if let Err(error) = write_config(&config) {
        return response_error(request_id, "config_write_failed", &error, true);
    }
    push_diagnostic(
        state,
        "info",
        "extension_paired",
        "Chrome extension paired successfully.",
    );
    response_ok(
        request_id,
        json!({
            "extensionId": extension_id,
            "credential": credential,
            "pairedAtMs": now_ms(),
        }),
    )
}

fn validate_paired_request(
    request_id: Option<String>,
    origin_extension_id: &str,
    request: &Value,
) -> Result<(), Value> {
    let config = load_config().unwrap_or_else(|_| default_config());
    let extension_id = request
        .get("extensionId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if extension_id != origin_extension_id || config.paired_extension_id != origin_extension_id {
        return Err(response_error(
            request_id,
            "unpaired",
            "Pair the Chrome extension with CareerCompiler before filling applications.",
            false,
        ));
    }
    let credential = request
        .get("credential")
        .and_then(Value::as_str)
        .unwrap_or("");
    if credential.is_empty() || sha256_hex(credential) != config.credential_hash {
        return Err(response_error(
            request_id,
            "credential_invalid",
            "The extension credential is missing or has been revoked.",
            false,
        ));
    }
    Ok(())
}

fn enqueue_desktop_request(state: &ExtensionBridgeState, request: Value) -> Value {
    let bridge_request_id = format!(
        "bridge-{}-{}",
        now_ms(),
        request_id(&request).unwrap_or_else(|| random_token(4))
    );
    let exchange = Arc::new(PendingExchange {
        response: Mutex::new(None),
        ready: Condvar::new(),
    });
    {
        let mut inflight = state
            .inner
            .inflight
            .lock()
            .expect("inflight mutex poisoned");
        inflight.insert(bridge_request_id.clone(), exchange.clone());
    }
    {
        let mut pending = state.inner.pending.lock().expect("pending mutex poisoned");
        pending.push_back(PendingExtensionRequest {
            bridge_request_id: bridge_request_id.clone(),
            received_at_ms: now_ms(),
            request,
        });
    }

    let response_guard = exchange.response.lock().expect("response mutex poisoned");
    let (response_guard, wait_result) = exchange
        .ready
        .wait_timeout(response_guard, DESKTOP_REQUEST_TIMEOUT)
        .expect("response condvar poisoned");
    let response = response_guard.clone();
    drop(response_guard);
    let mut inflight = state
        .inner
        .inflight
        .lock()
        .expect("inflight mutex poisoned");
    inflight.remove(&bridge_request_id);
    if wait_result.timed_out() {
        push_diagnostic(
            state,
            "warn",
            "desktop_response_timeout",
            "The desktop app did not finish an extension request in time.",
        );
        return response_error(
            None,
            "desktop_timeout",
            "CareerCompiler did not finish preparing this application in time.",
            true,
        );
    }
    response.unwrap_or_else(|| {
        response_error(
            None,
            "desktop_response_missing",
            "CareerCompiler finished without returning a response.",
            true,
        )
    })
}

pub fn should_run_as_native_host() -> bool {
    env::args()
        .skip(1)
        .any(|arg| arg == "--careercompiler-native-host" || arg.starts_with("chrome-extension://"))
}

fn native_host_origin() -> String {
    let args: Vec<String> = env::args().skip(1).collect();
    args.iter()
        .find(|arg| arg.starts_with("chrome-extension://"))
        .cloned()
        .unwrap_or_else(|| "chrome-extension://unknown/".to_string())
}

pub fn run_native_host_from_stdio() -> i32 {
    let origin = native_host_origin();
    let request = match read_native_json(io::stdin().lock(), MAX_CHROME_MESSAGE_BYTES) {
        Ok(request) => request,
        Err(error) => {
            let response = response_error(None, "malformed_native_message", &error, false);
            let _ = write_native_json(io::stdout().lock(), &response, MAX_CHROME_MESSAGE_BYTES);
            return 1;
        }
    };
    let response = match forward_to_desktop(origin, request) {
        Ok(response) => response,
        Err(error) => response_error(None, "desktop_unavailable", &error, true),
    };
    match write_native_json(io::stdout().lock(), &response, MAX_CHROME_MESSAGE_BYTES) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("careercompiler-native-host write failed: {error}");
            1
        }
    }
}

fn forward_to_desktop(origin: String, request: Value) -> Result<Value, String> {
    #[cfg(not(unix))]
    {
        let _ = origin;
        let _ = request;
        Err("Native messaging IPC is currently implemented for macOS.".to_string())
    }

    #[cfg(unix)]
    {
        let path = socket_path()?;
        let mut stream = UnixStream::connect(path).map_err(|error| {
            format!("CareerCompiler is not running or its native-host IPC is unavailable. {error}")
        })?;
        stream
            .set_read_timeout(Some(DESKTOP_REQUEST_TIMEOUT + Duration::from_secs(2)))
            .ok();
        stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
        write_framed_json(
            &mut stream,
            &HostEnvelope { origin, request },
            MAX_IPC_MESSAGE_BYTES,
        )?;
        read_framed_json(&mut stream, MAX_IPC_MESSAGE_BYTES)
    }
}

fn read_native_json<R: Read>(reader: R, max_bytes: u32) -> Result<Value, String> {
    read_framed_json(reader, max_bytes)
}

fn write_native_json<W: Write>(writer: W, value: &Value, max_bytes: u32) -> Result<(), String> {
    write_framed_json(writer, value, max_bytes)
}

fn read_framed_json<R: Read, T: for<'de> Deserialize<'de>>(
    mut reader: R,
    max_bytes: u32,
) -> Result<T, String> {
    let mut length_bytes = [0_u8; 4];
    reader
        .read_exact(&mut length_bytes)
        .map_err(|error| format!("message_length_read_failed|{error}"))?;
    let length = u32::from_le_bytes(length_bytes);
    if length == 0 || length > max_bytes {
        return Err(
            "message_size_invalid|Native message size is outside the allowed range.".to_string(),
        );
    }
    let mut buffer = vec![0_u8; length as usize];
    reader
        .read_exact(&mut buffer)
        .map_err(|error| format!("message_read_failed|{error}"))?;
    serde_json::from_slice(&buffer).map_err(|error| format!("message_json_invalid|{error}"))
}

fn write_framed_json<W: Write, T: Serialize>(
    mut writer: W,
    value: &T,
    max_bytes: u32,
) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| format!("message_json_encode_failed|{error}"))?;
    if bytes.is_empty() || bytes.len() > max_bytes as usize {
        return Err(
            "message_size_invalid|Native response size is outside the allowed range.".to_string(),
        );
    }
    writer
        .write_all(&(bytes.len() as u32).to_le_bytes())
        .map_err(|error| format!("message_length_write_failed|{error}"))?;
    writer
        .write_all(&bytes)
        .map_err(|error| format!("message_write_failed|{error}"))?;
    writer
        .flush()
        .map_err(|error| format!("message_flush_failed|{error}"))
}

fn ping_installed_host(extension_id: &str) -> Result<(), String> {
    let host_path = installed_host_path()?;
    let mut child = Command::new(host_path)
        .arg(format!("chrome-extension://{extension_id}/"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("host_spawn_failed|{error}"))?;
    let request_id = format!("verify-{}", now_ms());
    let request = json!({
        "type": "ping",
        "protocolVersion": PROTOCOL_VERSION,
        "requestId": request_id,
    });
    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "host_stdin_missing|Could not open native host stdin.".to_string())?;
        write_native_json(stdin, &request, MAX_CHROME_MESSAGE_BYTES)?;
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "host_stdout_missing|Could not open native host stdout.".to_string())?;
    let (sender, receiver) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let result: Result<Value, String> = read_native_json(stdout, MAX_CHROME_MESSAGE_BYTES);
        let _ = sender.send(result);
    });
    match receiver.recv_timeout(VERIFY_TIMEOUT) {
        Ok(Ok(response)) => {
            let _ = child.wait();
            if response.get("ok").and_then(Value::as_bool) == Some(true) {
                Ok(())
            } else {
                Err("host_ping_failed|Native host returned an error response.".to_string())
            }
        }
        Ok(Err(error)) => {
            let _ = child.kill();
            Err(error)
        }
        Err(_) => {
            let _ = child.kill();
            Err("host_ping_timeout|Native host did not respond to ping.".to_string())
        }
    }
}
