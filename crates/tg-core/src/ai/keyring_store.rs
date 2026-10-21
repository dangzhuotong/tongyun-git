use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};

use super::secret_store::{
    FileSecretStore, LegacyItem, LegacySecretSource, MigrationReport, SecretStoreError, StorePaths,
};
use crate::error::{CoreError, Result};

pub const SERVICE_NAME: &str = "com.tongyun.git";

static SECRET_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Directory that holds `secret.key` and `secrets.vault`. Desktop startup sets
/// this to the Tauri app data directory plus `secrets`.
pub fn configure_secret_dir(dir: &Path) -> Result<()> {
    let mut slot = SECRET_DIR
        .lock()
        .map_err(|_| CoreError::KeyringError("secret dir lock poisoned".to_string()))?;
    *slot = Some(dir.to_path_buf());
    Ok(())
}

pub trait KeyringStore: Send + Sync {
    fn get_key(&self, provider: &str) -> Result<Option<String>>;
    fn set_key(&self, provider: &str, key: &str) -> Result<()>;
    fn delete_key(&self, provider: &str) -> Result<()>;
    fn is_available(&self) -> bool;
}

fn make_user_name(provider: &str) -> String {
    format!("ai-key:{}", provider.to_lowercase())
}

/// AI keys stored in the local encrypted vault.
///
/// `get_key`, `set_key`, and `delete_key` never call the OS keychain.
/// [`SystemKeyring::migrate_from_os_keychain`] is the only path that does,
/// and only until `secrets.migrated` exists.
pub struct SystemKeyring {
    dir: PathBuf,
}

impl SystemKeyring {
    pub fn at(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn from_config() -> Result<Self> {
        let configured = SECRET_DIR
            .lock()
            .map_err(|_| CoreError::KeyringError("secret dir lock poisoned".to_string()))?
            .clone();
        let dir = match configured {
            Some(dir) => dir,
            None => default_secret_dir()?,
        };
        Ok(Self { dir })
    }

    /// Read each legacy `ai-key:<provider>` once, then skip the keychain.
    pub fn migrate_from_os_keychain(&self) -> Result<MigrationReport> {
        self.migrate_with(&OsKeychain)
    }

    pub fn migrate_with(&self, legacy: &dyn LegacySecretSource) -> Result<MigrationReport> {
        super::secret_store::migrate_in_dir(&self.paths(), legacy, &legacy_items())
            .map_err(store_err)
    }

    fn paths(&self) -> StorePaths {
        StorePaths::new(&self.dir)
    }

    fn open_store(&self) -> Result<FileSecretStore> {
        FileSecretStore::open(self.paths()).map_err(store_err)
    }
}

impl KeyringStore for SystemKeyring {
    fn get_key(&self, provider: &str) -> Result<Option<String>> {
        self.open_store()?
            .get(&make_user_name(provider))
            .map_err(store_err)
    }

    fn set_key(&self, provider: &str, key: &str) -> Result<()> {
        self.open_store()?
            .set(&make_user_name(provider), key)
            .map_err(store_err)
    }

    fn delete_key(&self, provider: &str) -> Result<()> {
        self.open_store()?
            .delete(&make_user_name(provider))
            .map_err(store_err)
    }

    fn is_available(&self) -> bool {
        self.open_store().is_ok()
    }
}

fn legacy_items() -> Vec<LegacyItem> {
    ["kie", "openai", "ollama"]
        .into_iter()
        .map(|provider| LegacyItem::new(SERVICE_NAME, make_user_name(provider)))
        .collect()
}

fn store_err(err: SecretStoreError) -> CoreError {
    CoreError::KeyringError(err.to_string())
}

fn default_secret_dir() -> Result<PathBuf> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| CoreError::KeyringError("home unavailable".to_string()))?;
    let base = if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| CoreError::KeyringError("APPDATA unavailable".to_string()))?
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
    };
    Ok(base.join("com.tongyun.git/secrets"))
}

/// OS keychain adapter used only by [`SystemKeyring::migrate_from_os_keychain`].
struct OsKeychain;

impl LegacySecretSource for OsKeychain {
    fn read(
        &self,
        service: &str,
        account: &str,
    ) -> std::result::Result<Option<String>, SecretStoreError> {
        let entry = keyring::Entry::new(service, account).map_err(SecretStoreError::legacy)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            // NoEntry: nothing was stored. NoStorageAccess: the platform store
            // cannot be opened (for example Linux without Secret Service).
            // There is no item to import, so the marker can be written and
            // later saves do not call the keychain. A cancelled macOS prompt
            // is PlatformFailure and still fails the attempt, leaving the
            // marker unwritten so the next launch can retry.
            Err(keyring::Error::NoEntry) | Err(keyring::Error::NoStorageAccess(_)) => Ok(None),
            Err(err) => Err(SecretStoreError::legacy(err)),
        }
    }

    fn delete(&self, service: &str, account: &str) -> std::result::Result<(), SecretStoreError> {
        let entry = keyring::Entry::new(service, account).map_err(SecretStoreError::legacy)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(SecretStoreError::legacy(err)),
        }
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
            return Err(CoreError::KeyringError("本机加密存储不可用".to_string()));
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
            return Err(CoreError::KeyringError("本机加密存储不可用".to_string()));
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
            return Err(CoreError::KeyringError("本机加密存储不可用".to_string()));
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
    fn test_memory_keyring_roundtrip() {
        let keyring = MemoryKeyring::new();
        keyring.set_key("local-test", "fixture-value").unwrap();
        assert_eq!(
            keyring.get_key("local-test").unwrap().as_deref(),
            Some("fixture-value")
        );
        keyring.delete_key("local-test").unwrap();
        assert_eq!(keyring.get_key("local-test").unwrap(), None);
    }

    #[test]
    fn rust9_memory_keyring_default_is_available_and_empty() {
        let keyring = MemoryKeyring::default();
        assert!(keyring.is_available());
        assert_eq!(keyring.get_key("kie").unwrap(), None);
    }

    #[test]
    fn rust9_memory_keyring_provider_names_are_case_insensitive() {
        let keyring = MemoryKeyring::new();
        keyring.set_key("OpenAI", "v").unwrap();
        assert_eq!(keyring.get_key("openai").unwrap().as_deref(), Some("v"));
        assert_eq!(keyring.get_key("OPENAI").unwrap().as_deref(), Some("v"));
        keyring.delete_key("openAi").unwrap();
        assert_eq!(keyring.get_key("openai").unwrap(), None);
    }

    #[test]
    fn rust9_memory_keyring_delete_when_unavailable_fails_closed() {
        let keyring = MemoryKeyring::new();
        keyring.set_key("openai", "v").unwrap();
        keyring.set_available(false);
        assert!(keyring.get_key("openai").is_err());
        assert!(keyring.set_key("openai", "w").is_err());
        assert!(keyring.delete_key("openai").is_err());
        keyring.set_available(true);
        assert_eq!(keyring.get_key("openai").unwrap().as_deref(), Some("v"));
    }
}

#[cfg(test)]
mod username_tests {
    use super::make_user_name;

    #[test]
    fn test_make_user_name_lowercases_provider() {
        assert_eq!(make_user_name("KIE"), "ai-key:kie");
        assert_eq!(make_user_name("OpenAI"), "ai-key:openai");
        assert_eq!(make_user_name("ollama"), "ai-key:ollama");
    }

    #[test]
    fn test_make_user_name_keeps_inner_characters() {
        assert_eq!(make_user_name("My-Provider_1"), "ai-key:my-provider_1");
    }
}

#[cfg(test)]
mod vault_tests {
    use super::{KeyringStore, SystemKeyring, SERVICE_NAME};
    use crate::ai::secret_store::{LegacySecretSource, SecretStoreError};
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Tmp(PathBuf);

    impl Tmp {
        fn new() -> Self {
            static N: AtomicU64 = AtomicU64::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir =
                std::env::temp_dir().join(format!("tg-vault-{}-{nanos}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
    }

    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct CountingLegacy {
        items: Mutex<BTreeMap<(String, String), String>>,
        reads: Mutex<usize>,
        deletes: Mutex<usize>,
    }

    impl CountingLegacy {
        fn with(items: Vec<(&str, &str, &str)>) -> Self {
            let mut map = BTreeMap::new();
            for (service, account, value) in items {
                map.insert(
                    (service.to_string(), account.to_string()),
                    value.to_string(),
                );
            }
            Self {
                items: Mutex::new(map),
                reads: Mutex::new(0),
                deletes: Mutex::new(0),
            }
        }

        fn reads(&self) -> usize {
            *self.reads.lock().expect("reads")
        }

        fn deletes(&self) -> usize {
            *self.deletes.lock().expect("deletes")
        }
    }

    impl LegacySecretSource for CountingLegacy {
        fn read(
            &self,
            service: &str,
            account: &str,
        ) -> std::result::Result<Option<String>, SecretStoreError> {
            *self.reads.lock().expect("reads") += 1;
            Ok(self
                .items
                .lock()
                .expect("items")
                .get(&(service.to_string(), account.to_string()))
                .cloned())
        }

        fn delete(
            &self,
            service: &str,
            account: &str,
        ) -> std::result::Result<(), SecretStoreError> {
            *self.deletes.lock().expect("deletes") += 1;
            self.items
                .lock()
                .expect("items")
                .remove(&(service.to_string(), account.to_string()));
            Ok(())
        }
    }

    struct PanicLegacy;

    impl LegacySecretSource for PanicLegacy {
        fn read(&self, _: &str, _: &str) -> std::result::Result<Option<String>, SecretStoreError> {
            panic!("legacy read must not run");
        }

        fn delete(&self, _: &str, _: &str) -> std::result::Result<(), SecretStoreError> {
            panic!("legacy delete must not run");
        }
    }

    #[test]
    fn three_saves_after_migration_do_not_touch_legacy() {
        let dir = Tmp::new();
        let keyring = SystemKeyring::at(&dir.0);
        let legacy = CountingLegacy::with(vec![
            (SERVICE_NAME, "ai-key:kie", "old-kie-fixture"),
            (SERVICE_NAME, "ai-key:openai", "old-openai-fixture"),
        ]);
        let report = keyring.migrate_with(&legacy).unwrap();
        assert_eq!(report.imported, 2);
        assert_eq!(report.absent, 1);
        assert_eq!(report.deleted, 2);
        assert_eq!(legacy.reads(), 3);
        assert_eq!(
            keyring.get_key("kie").unwrap().as_deref(),
            Some("old-kie-fixture")
        );

        keyring.set_key("kie", "one-fixture-value").unwrap();
        keyring.set_key("kie", "two-fixture-value").unwrap();
        keyring.set_key("openai", "three-fixture-value").unwrap();
        assert_eq!(legacy.reads(), 3, "three saves must not re-read keychain");
        assert_eq!(legacy.deletes(), 2);
        assert_eq!(
            keyring.get_key("kie").unwrap().as_deref(),
            Some("two-fixture-value")
        );
        assert_eq!(
            keyring.get_key("openai").unwrap().as_deref(),
            Some("three-fixture-value")
        );
        assert_eq!(keyring.get_key("ollama").unwrap(), None);

        let again = keyring.migrate_with(&PanicLegacy).unwrap();
        assert!(again.already_migrated);
        assert_eq!(legacy.reads(), 3);

        let vault = fs::read(dir.0.join("secrets.vault")).unwrap();
        assert!(!vault
            .windows(b"two-fixture-value".len())
            .any(|w| w == b"two-fixture-value"));
        assert!(!vault
            .windows(b"old-kie-fixture".len())
            .any(|w| w == b"old-kie-fixture"));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_vault_dir_is_unavailable_and_does_not_receive_plaintext() {
        let dir = Tmp::new();
        let real = dir.0.join("real");
        fs::create_dir_all(&real).unwrap();
        let link = dir.0.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let keyring = SystemKeyring::at(&link);
        assert!(!keyring.is_available());
        assert!(keyring.set_key("kie", "fixture-value").is_err());
        assert!(fs::read_dir(&real).unwrap().next().is_none());
    }
}
