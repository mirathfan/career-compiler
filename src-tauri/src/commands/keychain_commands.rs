use crate::keychain::{key_status, resolve_openai_key, KeyringSecretStore, SecretStatus};

#[tauri::command]
pub fn get_openai_key_status() -> Result<SecretStatus, String> {
    key_status(&KeyringSecretStore)
}

#[tauri::command]
pub fn set_openai_key(key: String) -> Result<SecretStatus, String> {
    let trimmed = key.trim();
    if trimmed.len() < 12 || !trimmed.starts_with("sk-") {
        return Err("The OpenAI key does not look valid. It should start with sk-.".to_string());
    }
    crate::keychain::SecretStore::set_secret(&KeyringSecretStore, trimmed)?;
    key_status(&KeyringSecretStore)
}

#[tauri::command]
pub fn delete_openai_key() -> Result<SecretStatus, String> {
    crate::keychain::SecretStore::delete_secret(&KeyringSecretStore)?;
    key_status(&KeyringSecretStore)
}

#[tauri::command]
pub fn test_openai_key() -> Result<String, String> {
    let key = resolve_openai_key(&KeyringSecretStore)?;
    if key.starts_with("sk-") {
        Ok("OpenAI API key is present and has the expected prefix.".to_string())
    } else {
        Err("OpenAI API key is present but does not have the expected prefix.".to_string())
    }
}
