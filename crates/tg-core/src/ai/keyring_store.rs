use std::collections::HashMap;
use std::sync::RwLock;

use crate::error::{CoreError, Result};

pub const SERVICE_NAME: &str = "com.tongyun.git";

pub trait KeyringStore: Send + Sync {
    fn get_key(&self, provider: &str) -> Result<Option<String>>;
    fn set_key(&self, provider: &str, key: &str) -> Result<()>;
    fn delete_key(&self, provider: &str) -> Result<()>;
    fn is_available(&self) -> bool;
}

fn make_user_name(provider: &str) -> String {
    format!("ai-key:{}", provider.to_lowercase())
}

/// Real system keyring implementation using Windows Credential Manager / macOS Keychain / Secret Service
pub struct SystemKeyring;

impl KeyringStore for SystemKeyring {
    fn get_key(&self, provider: &str) -> Result<Option<String>> {
        let user = make_user_name(provider);
        let entry = keyring::Entry::new(SERVICE_NAME, &user)
            .map_err(|e| CoreError::KeyringError(e.to_string()))?;

        match entry.get_password() {
            Ok(pwd) => Ok(Some(pwd)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(CoreError::KeyringError(e.to_string())),
        }
    }

    fn set_key(&self, provider: &str, key: &str) -> Result<()> {
        let user = make_user_name(provider);
        let entry = keyring::Entry::new(SERVICE_NAME, &user)
            .map_err(|e| CoreError::KeyringError(e.to_string()))?;

        entry
            .set_password(key)
            .map_err(|e| CoreError::KeyringError(e.to_string()))?;
        Ok(())
    }

    fn delete_key(&self, provider: &str) -> Result<()> {
        let user = make_user_name(provider);
        let entry = keyring::Entry::new(SERVICE_NAME, &user)
            .map_err(|e| CoreError::KeyringError(e.to_string()))?;

        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CoreError::KeyringError(e.to_string())),
        }
    }

    fn is_available(&self) -> bool {
        // Test with a dummy entry creation check
        keyring::Entry::new(SERVICE_NAME, "probe").is_ok()
    }
}

/// In-memory mock keyring store for L1 tests and CI environments
pub struct MemoryKeyring {
    available: RwLock<bool>,
    store: RwLock<HashMap<String, String>>,
}

impl MemoryKeyring {
    pub fn new() -> Self {
        Self {
            available: RwLock::new(true),
            store: RwLock::new(HashMap::new()),
        }
    }

    pub fn set_available(&self, avail: bool) {
        if let Ok(mut lock) = self.available.write() {
            *lock = avail;
        }
    }
}

impl Default for MemoryKeyring {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyringStore for MemoryKeyring {
    fn get_key(&self, provider: &str) -> Result<Option<String>> {
        if !self.is_available() {
            return Err(CoreError::KeyringError("系统钥匙串不可用".to_string()));
        }
        let user = make_user_name(provider);
        let lock = self
            .store
            .read()
            .map_err(|_| CoreError::KeyringError("Lock error".to_string()))?;
        Ok(lock.get(&user).cloned())
    }

    fn set_key(&self, provider: &str, key: &str) -> Result<()> {
        if !self.is_available() {
            return Err(CoreError::KeyringError("系统钥匙串不可用".to_string()));
        }
        let user = make_user_name(provider);
        let mut lock = self
            .store
            .write()
            .map_err(|_| CoreError::KeyringError("Lock error".to_string()))?;
        lock.insert(user, key.to_string());
        Ok(())
    }

    fn delete_key(&self, provider: &str) -> Result<()> {
        if !self.is_available() {
            return Err(CoreError::KeyringError("系统钥匙串不可用".to_string()));
        }
        let user = make_user_name(provider);
        let mut lock = self
            .store
            .write()
            .map_err(|_| CoreError::KeyringError("Lock error".to_string()))?;
        lock.remove(&user);
        Ok(())
    }

    fn is_available(&self) -> bool {
        self.available.read().map(|b| *b).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_keyring_roundtrip() {
        let keyring = SystemKeyring;
        if !keyring.is_available() {
            return;
        }
        let provider = "test_roundtrip_provider";
        let secret = "sk-test-secret-value-789";

        // 1. Set key
        keyring
            .set_key(provider, secret)
            .expect("set_key should succeed");

        // 2. Read key
        let read_val = keyring.get_key(provider).expect("get_key should succeed");
        assert_eq!(read_val, Some(secret.to_string()));

        // 3. Delete key
        keyring
            .delete_key(provider)
            .expect("delete_key should succeed");
        let after_delete = keyring.get_key(provider).expect("get_key after delete");
        assert_eq!(after_delete, None);
    }
}
