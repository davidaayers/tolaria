use crate::automation::{
    list_automations as scan_automations, load_trust, run_approved_command, set_trust,
    AutomationListing, CommandOutcome, CommandRequest, TrustStatus,
};
use std::collections::HashMap;

use super::vault::with_boundary;

#[tauri::command]
pub fn list_automations(vault_path: String) -> Result<AutomationListing, String> {
    with_boundary(Some(vault_path.as_str()), |boundary| {
        Ok(scan_automations(boundary.requested_root()))
    })
}

#[tauri::command]
pub fn get_automation_trust(vault_path: String) -> Result<HashMap<String, TrustStatus>, String> {
    with_boundary(Some(vault_path.as_str()), |boundary| {
        load_trust(boundary.requested_root())
    })
}

#[tauri::command]
pub fn set_automation_trust(
    vault_path: String,
    hash: String,
    approved: bool,
) -> Result<(), String> {
    let status = if approved {
        TrustStatus::Approved
    } else {
        TrustStatus::Declined
    };
    with_boundary(Some(vault_path.as_str()), |boundary| {
        set_trust(boundary.requested_root(), &hash, status)
    })
}

/// Runs a program named by an approved automation file; see `run_approved_command` for the checks.
#[tauri::command]
pub async fn run_automation_command(
    vault_path: String,
    filename: String,
    request: CommandRequest,
) -> Result<CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_boundary(Some(vault_path.as_str()), |boundary| {
            run_approved_command(boundary.requested_root(), &filename, request)
        })
    })
    .await
    .map_err(|e| format!("Automation task failed: {e}"))?
}
