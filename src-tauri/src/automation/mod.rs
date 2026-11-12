//! Vault automations (ADR-0302): files in `automations/`, their approval, and running approved commands.

mod command;
mod definition;
mod trust;

pub use command::{run_command, CommandOutcome, CommandRequest};
pub use definition::{parse_definition, Action, Definition};
pub use trust::{load_trust, set_trust, TrustStatus};

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct AutomationFile {
    pub filename: String,
    /// SHA-256 of the file content, hex; approval is recorded against it.
    pub hash: String,
    pub definition: Definition,
}

#[derive(Debug, Clone, Serialize)]
pub struct AutomationError {
    pub filename: String,
    pub error: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct AutomationListing {
    pub files: Vec<AutomationFile>,
    pub errors: Vec<AutomationError>,
}

pub fn content_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_automation_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("yml") | Some("yaml")
    )
}

/// Read and parse every `automations/*.yml` in the vault, in filename order. Broken files are reported, not fatal.
pub fn list_automations(vault_root: &Path) -> AutomationListing {
    let dir = vault_root.join("automations");
    let Ok(entries) = fs::read_dir(&dir) else {
        return AutomationListing::default();
    };
    let mut paths: Vec<_> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_automation_file(path))
        .collect();
    paths.sort();

    let mut listing = AutomationListing::default();
    for path in paths {
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        match read_one(&path, filename.clone()) {
            Ok(file) => listing.files.push(file),
            Err(error) => listing.errors.push(AutomationError { filename, error }),
        }
    }
    listing
}

fn read_one(path: &Path, filename: String) -> Result<AutomationFile, String> {
    let bytes = fs::read(path).map_err(|e| format!("could not read file: {e}"))?;
    let content =
        String::from_utf8(bytes.clone()).map_err(|_| "file is not valid UTF-8".to_string())?;
    let definition = parse_definition(&content)?;
    Ok(AutomationFile {
        filename,
        hash: content_hash(&bytes),
        definition,
    })
}

/// Run `request` for the automation `filename`, but only if its current content is approved and the program
/// is one the file itself names. This keeps the approval check in the backend, not only in the renderer.
pub fn run_approved_command(
    vault_root: &Path,
    filename: &str,
    request: CommandRequest,
) -> Result<CommandOutcome, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid automation filename".to_string());
    }
    let file = read_one(
        &vault_root.join("automations").join(filename),
        filename.to_string(),
    )?;
    let approved = load_trust(vault_root)?.get(&file.hash) == Some(&TrustStatus::Approved);
    if !approved {
        return Err("This automation is not approved".to_string());
    }
    let program = request.argv.first().map(String::as_str).unwrap_or_default();
    let named = file.definition.actions.iter().any(|action| {
        matches!(action, Action::Run { argv, .. } if argv.first().map(String::as_str) == Some(program))
    });
    if !named {
        return Err("The program is not named by the approved automation".to_string());
    }
    Ok(run_command(vault_root, request))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_with(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let automations = dir.path().join("automations");
        fs::create_dir(&automations).unwrap();
        for (name, content) in files {
            fs::write(automations.join(name), content).unwrap();
        }
        dir
    }

    const GOOD: &str = "name: A\non: { property: status }\ndo:\n  - set: { x: 1 }\n";
    const RUNS: &str = "name: R\non: { property: status }\ndo:\n  - run: [/bin/echo, hi]\n";

    #[test]
    fn lists_files_in_order_with_content_hashes_and_reports_broken_ones() {
        let vault = vault_with(&[
            ("b.yml", GOOD),
            ("a.yaml", GOOD),
            ("c.yml", "name: ["),
            ("notes.txt", "x"),
        ]);
        let listing = list_automations(vault.path());
        let names: Vec<_> = listing.files.iter().map(|f| f.filename.as_str()).collect();
        assert_eq!(names, ["a.yaml", "b.yml"]);
        assert_eq!(listing.files[0].hash, content_hash(GOOD.as_bytes()));
        assert_eq!(listing.errors.len(), 1);
        assert_eq!(listing.errors[0].filename, "c.yml");
    }

    #[test]
    fn a_vault_without_automations_lists_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let listing = list_automations(dir.path());
        assert!(listing.files.is_empty() && listing.errors.is_empty());
    }

    #[test]
    fn the_hash_changes_with_the_content() {
        assert_ne!(content_hash(b"a"), content_hash(b"b"));
        assert_eq!(content_hash(b"a").len(), 64);
    }

    fn request(argv: &[&str]) -> CommandRequest {
        CommandRequest {
            argv: argv.iter().map(|s| s.to_string()).collect(),
            timeout_seconds: 5,
            env: Default::default(),
        }
    }

    #[test]
    fn refuses_to_run_an_unapproved_automation() {
        let vault = vault_with(&[("r.yml", RUNS)]);
        let error =
            run_approved_command(vault.path(), "r.yml", request(&["/bin/echo", "hi"])).unwrap_err();
        assert!(error.contains("not approved"), "{error}");
    }

    #[test]
    fn refuses_a_program_the_file_does_not_name_and_a_path_escape() {
        let vault = vault_with(&[("r.yml", RUNS)]);
        let hash = content_hash(RUNS.as_bytes());
        trust::set_trust_in(
            &trust::trust_path_for_tests(vault.path()),
            vault.path(),
            &hash,
            TrustStatus::Approved,
        )
        .unwrap();
        let other = run_approved_command(vault.path(), "r.yml", request(&["/bin/ls"])).unwrap_err();
        assert!(other.contains("not named"), "{other}");
        let escape =
            run_approved_command(vault.path(), "../r.yml", request(&["/bin/echo"])).unwrap_err();
        assert!(escape.contains("Invalid"), "{escape}");
    }

    #[cfg(unix)]
    #[test]
    fn runs_an_approved_automation_and_withdraws_approval_when_the_file_changes() {
        let vault = vault_with(&[("r.yml", RUNS)]);
        let path = trust::trust_path_for_tests(vault.path());
        trust::set_trust_in(
            &path,
            vault.path(),
            &content_hash(RUNS.as_bytes()),
            TrustStatus::Approved,
        )
        .unwrap();
        let outcome =
            run_approved_command(vault.path(), "r.yml", request(&["/bin/echo", "linked it"]))
                .unwrap();
        assert!(outcome.ok);
        assert_eq!(outcome.message.as_deref(), Some("linked it"));

        fs::write(
            vault.path().join("automations/r.yml"),
            format!("{RUNS}# edited\n"),
        )
        .unwrap();
        let error =
            run_approved_command(vault.path(), "r.yml", request(&["/bin/echo", "x"])).unwrap_err();
        assert!(error.contains("not approved"), "{error}");
    }
}
