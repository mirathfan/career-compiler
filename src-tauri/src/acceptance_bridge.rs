//! Test-only IPC: never registered or paired with a production browser/profile.
use serde_json::{json, Value};
use std::os::unix::{fs::PermissionsExt, net::UnixListener};
use std::{
    collections::{HashSet, VecDeque},
    io::{Read, Write},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Emitter;
#[cfg(test)]
const EXTENSION: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAX: usize = 1024 * 1024;
#[derive(Clone, Default)]
pub struct TestBridge(Arc<Mutex<State>>);
#[derive(Default)]
struct State {
    seen: HashSet<String>,
    pending: VecDeque<String>,
    exchanges: std::collections::HashMap<String, Exchange>,
}
struct Exchange {
    request: String,
    deadline: Instant,
    sender: mpsc::Sender<Value>,
}
fn error(code: &str) -> Value {
    json!({"protocolVersion":3,"ok":false,"error":{"code":code,"message":code,"retryable":false}})
}
fn local_url(value: &Value) -> bool {
    let Some(url) = value.as_str() else {
        return false;
    };
    ["greenhouse", "lever", "ashby", "multi-step", "dynamic"]
        .iter()
        .any(|name| url == format!("http://127.0.0.1:5297/{name}.html"))
}
fn validate(origin: &str, request: &Value, extension: &str) -> Result<(), &'static str> {
    if origin != format!("chrome-extension://{extension}/") || request["extensionId"] != extension {
        return Err("extension_denied");
    }
    if request["protocolVersion"] != 3 {
        return Err("version_mismatch");
    }
    if request["credential"]
        .as_str()
        .is_some_and(|v| !v.is_empty())
    {
        return Err("credentials_forbidden");
    }
    let id = request["requestId"].as_str().ok_or("schema_invalid")?;
    if id.is_empty() || id.len() > 100 {
        return Err("schema_invalid");
    }
    match request["type"].as_str() {
        Some("ping") => Ok(()),
        Some("prepare_application")
            if local_url(&request["pageContext"]["url"])
                && request["fields"].as_array().is_some_and(|v| v.len() <= 100) =>
        {
            Ok(())
        }
        Some("authorize_fill")
            if local_url(&request["pageUrl"]) && request["prepared"].is_object() =>
        {
            Ok(())
        }
        Some("mark_filled")
            if request["applicationId"].is_string()
                && request["fillAuthorizationId"].is_string() =>
        {
            Ok(())
        }
        _ => Err("command_or_origin_denied"),
    }
}
fn read_frame(stream: &mut impl Read) -> Result<Value, &'static str> {
    let mut header = [0; 4];
    stream
        .read_exact(&mut header)
        .map_err(|_| "truncated_message")?;
    let size = u32::from_le_bytes(header) as usize;
    if size == 0 || size > MAX {
        return Err("message_too_large");
    }
    let mut bytes = vec![0; size];
    stream
        .read_exact(&mut bytes)
        .map_err(|_| "truncated_message")?;
    serde_json::from_slice(&bytes).map_err(|_| "malformed_json")
}
fn write_frame(stream: &mut impl Write, value: &Value) {
    let bytes = serde_json::to_vec(value).unwrap();
    if bytes.len() <= MAX {
        let _ = stream.write_all(&(bytes.len() as u32).to_le_bytes());
        let _ = stream.write_all(&bytes);
    }
}
pub fn start(app: &tauri::AppHandle, state: TestBridge) -> Result<(), String> {
    if std::env::var("CC_ACCEPTANCE_BRIDGE").as_deref() != Ok("1") {
        return Ok(());
    }
    let root = crate::acceptance::root_for_identifier(&app.config().identifier)?
        .ok_or("Test identifier required")?;
    let identity_path = root.join("TEST_EXTENSION_ID");
    if identity_path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Test identity symlinks denied".into());
    }
    let extension = std::fs::read_to_string(identity_path)
        .map_err(|_| "Explicit test extension identity required")?
        .trim()
        .to_owned();
    if extension.len() != 32 || !extension.bytes().all(|byte| (b'a'..=b'p').contains(&byte)) {
        return Err("Invalid test extension identity".into());
    }
    let path = root.join("s");
    // No overwrite, even another test listener. Explicitly clean up a stopped test socket.
    let listener = UnixListener::bind(path).map_err(|e| e.to_string())?;
    listener.set_nonblocking(false).map_err(|e| e.to_string())?;
    std::fs::set_permissions(root.join("s"), std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    let emitter = app.clone();
    std::thread::spawn(move || {
        for mut stream in listener.incoming().flatten() {
            let state = state.clone();
            let emitter = emitter.clone();
            let extension = extension.clone();
            std::thread::spawn(move || {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let result = (|| {
                    let envelope = read_frame(&mut stream)?;
                    let origin = envelope["origin"].as_str().ok_or("schema_invalid")?;
                    let raw = envelope["requestJson"].as_str().ok_or("schema_invalid")?;
                    let request: Value = serde_json::from_str(raw).map_err(|_| "schema_invalid")?;
                    validate(origin, &request, &extension)?;
                    if request["type"] == "ping" {
                        return Ok(
                            json!({"protocolVersion":3,"ok":true,"data":{"testOnly":true,"nativeHostName":"com.mirathfan.careercompiler.acceptance"}}),
                        );
                    }
                    let id = request["requestId"].as_str().unwrap().to_owned();
                    let (sender, receiver) = mpsc::channel();
                    {
                        let mut guard = state.0.lock().unwrap();
                        if guard.seen.len() >= 10000 || !guard.seen.insert(id.clone()) {
                            return Err("duplicate_request");
                        }
                        guard.pending.push_back(id.clone());
                        guard.exchanges.insert(
                            id.clone(),
                            Exchange {
                                request: serde_json::to_string(&request)
                                    .map_err(|_| "schema_invalid")?,
                                deadline: Instant::now() + Duration::from_secs(5),
                                sender,
                            },
                        );
                    }
                    let _ = emitter.emit("acceptance-extension-request", ());
                    let response = receiver
                        .recv_timeout(Duration::from_secs(5))
                        .map_err(|_| "desktop_timeout");
                    state.0.lock().unwrap().exchanges.remove(&id);
                    response
                })();
                write_frame(&mut stream, &result.unwrap_or_else(error));
            });
        }
    });
    Ok(())
}
#[tauri::command]
pub fn acceptance_bridge_next(state: tauri::State<'_, TestBridge>) -> Option<String> {
    let mut state = state.0.lock().unwrap();
    while let Some(id) = state.pending.pop_front() {
        if let Some(exchange) = state.exchanges.get(&id) {
            if exchange.deadline > Instant::now() {
                return Some(exchange.request.clone());
            }
        }
    }
    None
}
#[tauri::command]
pub fn acceptance_bridge_complete(
    state: tauri::State<'_, TestBridge>,
    id: String,
    response: String,
) -> bool {
    state
        .0
        .lock()
        .unwrap()
        .exchanges
        .get(&id)
        .is_some_and(|exchange| {
            exchange.deadline > Instant::now()
                && serde_json::from_str::<Value>(&response)
                    .is_ok_and(|normalized| exchange.sender.send(normalized).is_ok())
        })
}
#[tauri::command]
pub fn acceptance_resume_file(
    app: tauri::AppHandle,
    path: String,
    expected_digest: String,
) -> Result<Value, String> {
    use base64::Engine;
    let root = crate::acceptance::root_for_identifier(&app.config().identifier)?
        .ok_or("Acceptance required")?;
    let requested = std::path::PathBuf::from(path);
    if ![root.join("resume-a.pdf"), root.join("resume-b.pdf")].contains(&requested)
        || requested
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
    {
        return Err("resume_path_denied".into());
    }
    let bytes = std::fs::read(requested).map_err(|_| "resume_read_failed")?;
    if bytes.len() > 700 * 1024 || !bytes.starts_with(b"%PDF-") {
        return Err("resume_invalid".into());
    }
    use sha2::{Digest, Sha256};
    let content_digest = format!("{:x}", Sha256::digest(&bytes));
    if content_digest != expected_digest {
        return Err("resume_pdf_changed".into());
    }
    Ok(
        json!({"contentDigest":content_digest,"authorizedFileReference":"synthetic-only","filename":"Synthetic.pdf","mimeType":"application/pdf","sizeBytes":bytes.len(),"expiresAtMs":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()+60000,"fileBase64":base64::engine::general_purpose::STANDARD.encode(bytes)}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn framing_is_bounded_and_rejects_bad_json() {
        assert_eq!(
            read_frame(&mut &u32::MAX.to_le_bytes()[..]).unwrap_err(),
            "message_too_large"
        );
        assert!(read_frame(&mut &[1, 0, 0, 0, b'{'][..]).is_err());
        assert!(read_frame(&mut &[20, 0, 0, 0, b'{'][..]).is_err());
    }
    #[test]
    fn only_test_identity_and_loopback_commands_are_allowed() {
        let origin = format!("chrome-extension://{EXTENSION}/");
        let valid = json!({"type":"prepare_application","protocolVersion":3,"requestId":"x","extensionId":EXTENSION,"pageContext":{"url":"http://127.0.0.1:5297/greenhouse.html"},"fields":[]});
        assert!(validate(&origin, &valid, EXTENSION).is_ok());
        for changes in [
            json!({"type":"read_file"}),
            json!({"type":"run_openai_structured"}),
            json!({"protocolVersion":1}),
            json!({"extensionId":"wrong"}),
            json!({"credential":"secret"}),
            json!({"pageContext":{"url":"https://boards.greenhouse.io/real"}}),
        ] {
            let mut request = valid.clone();
            for (k, v) in changes.as_object().unwrap() {
                request[k] = v.clone();
            }
            assert!(validate(&origin, &request, EXTENSION).is_err());
        }
        assert!(validate("chrome-extension://wrong/", &valid, EXTENSION).is_err());
    }
}
