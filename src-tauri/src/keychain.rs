use serde::Serialize;

pub const OPENAI_SERVICE: &str = "com.mirathfan.careercompiler";
pub const OPENAI_ACCOUNT: &str = "openai-api-key";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    pub exists: bool,
    pub source: String,
    pub masked_suffix: String,
}

pub trait SecretStore {
    fn set_secret(&self, secret: &str) -> Result<(), String>;
    fn get_secret(&self) -> Result<Option<String>, String>;
    fn delete_secret(&self) -> Result<(), String>;
}

pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn set_secret(&self, secret: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(OPENAI_SERVICE, OPENAI_ACCOUNT).map_err(to_keychain_error)?;
        entry.set_password(secret).map_err(to_keychain_error)
    }

    fn get_secret(&self) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(OPENAI_SERVICE, OPENAI_ACCOUNT).map_err(to_keychain_error)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(to_keychain_error(error)),
        }
    }

    fn delete_secret(&self) -> Result<(), String> {
        let entry =
            keyring::Entry::new(OPENAI_SERVICE, OPENAI_ACCOUNT).map_err(to_keychain_error)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(to_keychain_error(error)),
        }
    }
}

pub fn masked_suffix(secret: &str) -> String {
    secret
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

pub fn key_status<S: SecretStore>(store: &S) -> Result<SecretStatus, String> {
    if let Some(secret) = store.get_secret()? {
        return Ok(SecretStatus {
            exists: true,
            source: "keychain".to_string(),
            masked_suffix: masked_suffix(&secret),
        });
    }
    if let Ok(secret) = std::env::var("OPENAI_API_KEY") {
        if !secret.is_empty() {
            return Ok(SecretStatus {
                exists: true,
                source: "env".to_string(),
                masked_suffix: masked_suffix(&secret),
            });
        }
    }
    Ok(SecretStatus {
        exists: false,
        source: "none".to_string(),
        masked_suffix: String::new(),
    })
}

pub fn resolve_openai_key<S: SecretStore>(store: &S) -> Result<String, String> {
    if let Some(secret) = store.get_secret()? {
        return Ok(secret);
    }
    std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|secret| !secret.is_empty())
        .ok_or_else(|| {
            "missing_api_key|OpenAI API key is missing. Add it in Settings or set OPENAI_API_KEY for development."
                .to_string()
        })
}

fn to_keychain_error(error: keyring::Error) -> String {
    format!("Keychain operation failed: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct MemorySecretStore {
        value: RefCell<Option<String>>,
    }

    impl SecretStore for MemorySecretStore {
        fn set_secret(&self, secret: &str) -> Result<(), String> {
            self.value.replace(Some(secret.to_string()));
            Ok(())
        }

        fn get_secret(&self) -> Result<Option<String>, String> {
            Ok(self.value.borrow().clone())
        }

        fn delete_secret(&self) -> Result<(), String> {
            self.value.replace(None);
            Ok(())
        }
    }

    #[test]
    fn masks_only_suffix() {
        assert_eq!(masked_suffix("sk-test-abcdef"), "cdef");
    }

    #[test]
    fn reports_keychain_status() {
        let store = MemorySecretStore::default();
        store.set_secret("sk-test-1234").unwrap();
        let status = key_status(&store).unwrap();
        assert!(status.exists);
        assert_eq!(status.source, "keychain");
        assert_eq!(status.masked_suffix, "1234");
    }

    #[test]
    fn resolves_secret_from_store() {
        let store = MemorySecretStore::default();
        store.set_secret("sk-test-value").unwrap();
        assert_eq!(resolve_openai_key(&store).unwrap(), "sk-test-value");
        store.delete_secret().unwrap();
        assert!(resolve_openai_key(&store).is_err());
    }
}
