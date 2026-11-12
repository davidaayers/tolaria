//! Which automation files the user approved. Stored in the app configuration directory, never in the vault,
//! so a vault cannot approve itself. Keyed by vault path, then by the SHA-256 of the file (ADR-0302).

use crate::app_config::{preferred_app_config_path, resolve_existing_or_preferred_app_config_path};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrustStatus {
    Approved,
    Declined,
}

type Store = BTreeMap<String, BTreeMap<String, TrustStatus>>;

fn vault_key(vault_root: &Path) -> String {
    fs::canonicalize(vault_root)
        .unwrap_or_else(|_| vault_root.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Tests keep the store beside the vault so they never touch the real configuration directory.
pub(super) fn trust_path_for_tests(vault_root: &Path) -> PathBuf {
    vault_root.join(".automation-trust-test.json")
}

fn read_path(vault_root: &Path) -> Result<PathBuf, String> {
    if cfg!(test) {
        return Ok(trust_path_for_tests(vault_root));
    }
    resolve_existing_or_preferred_app_config_path("automation_trust.json")
}

fn write_path(vault_root: &Path) -> Result<PathBuf, String> {
    if cfg!(test) {
        return Ok(trust_path_for_tests(vault_root));
    }
    preferred_app_config_path("automation_trust.json")
}

fn load_store(path: &Path) -> Result<Store, String> {
    if !path.exists() {
        return Ok(Store::new());
    }
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read automation approvals: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse automation approvals: {e}"))
}

pub fn load_trust(vault_root: &Path) -> Result<HashMap<String, TrustStatus>, String> {
    let store = load_store(&read_path(vault_root)?)?;
    Ok(store
        .get(&vault_key(vault_root))
        .map(|hashes| {
            hashes
                .iter()
                .map(|(hash, status)| (hash.clone(), *status))
                .collect()
        })
        .unwrap_or_default())
}

pub(super) fn set_trust_in(
    path: &Path,
    vault_root: &Path,
    hash: &str,
    status: TrustStatus,
) -> Result<(), String> {
    let mut store = load_store(path)?;
    store
        .entry(vault_key(vault_root))
        .or_default()
        .insert(hash.to_string(), status);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to save automation approvals: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, json).map_err(|e| format!("Failed to save automation approvals: {e}"))?;
    fs::rename(&temp, path).map_err(|e| format!("Failed to save automation approvals: {e}"))
}

pub fn set_trust(vault_root: &Path, hash: &str, status: TrustStatus) -> Result<(), String> {
    set_trust_in(&write_path(vault_root)?, vault_root, hash, status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_and_reads_back_per_vault_and_per_hash() {
        let vault = tempfile::tempdir().unwrap();
        assert!(load_trust(vault.path()).unwrap().is_empty());
        set_trust(vault.path(), "aaa", TrustStatus::Approved).unwrap();
        set_trust(vault.path(), "bbb", TrustStatus::Declined).unwrap();
        let trust = load_trust(vault.path()).unwrap();
        assert_eq!(trust.get("aaa"), Some(&TrustStatus::Approved));
        assert_eq!(trust.get("bbb"), Some(&TrustStatus::Declined));
        assert_eq!(trust.get("ccc"), None);
    }

    #[test]
    fn a_later_answer_replaces_an_earlier_one_and_vaults_do_not_share() {
        let vault = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        set_trust(vault.path(), "aaa", TrustStatus::Declined).unwrap();
        set_trust(vault.path(), "aaa", TrustStatus::Approved).unwrap();
        assert_eq!(
            load_trust(vault.path()).unwrap().get("aaa"),
            Some(&TrustStatus::Approved)
        );
        assert!(load_trust(other.path()).unwrap().is_empty());
    }

    #[test]
    fn a_corrupt_store_is_an_error_not_an_approval() {
        let vault = tempfile::tempdir().unwrap();
        fs::write(trust_path_for_tests(vault.path()), "not json").unwrap();
        assert!(load_trust(vault.path())
            .unwrap_err()
            .contains("Failed to parse"));
    }
}
