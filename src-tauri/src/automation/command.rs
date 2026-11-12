//! Spawn an approved automation program: argv only (no shell), vault root as working directory, a hard timeout.

use super::definition::MAX_TIMEOUT_SECONDS;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_MESSAGE_CHARS: usize = 200;
const MAX_CAPTURED_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    pub argv: Vec<String>,
    pub timeout_seconds: u64,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommandOutcome {
    pub ok: bool,
    /// First non-empty stdout line of a successful run.
    pub message: Option<String>,
    pub error: Option<String>,
}

fn failure(error: String) -> CommandOutcome {
    CommandOutcome {
        ok: false,
        message: None,
        error: Some(error),
    }
}

fn capture(mut stream: impl Read + Send + 'static) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = (&mut stream)
            .take(MAX_CAPTURED_BYTES)
            .read_to_end(&mut bytes);
        let _ = std::io::copy(&mut stream, &mut std::io::sink());
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

fn first_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(MAX_MESSAGE_CHARS).collect())
}

fn last_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .rev()
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(MAX_MESSAGE_CHARS).collect())
}

pub fn run_command(vault_root: &Path, request: CommandRequest) -> CommandOutcome {
    let Some(program) = request.argv.first() else {
        return failure("No program to run".to_string());
    };
    if !Path::new(program).is_absolute() {
        return failure(format!("The program must be an absolute path: {program}"));
    }
    let timeout = Duration::from_secs(request.timeout_seconds.clamp(1, MAX_TIMEOUT_SECONDS));
    let mut child = match Command::new(program)
        .args(&request.argv[1..])
        .current_dir(vault_root)
        .envs(&request.env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => return failure(format!("Could not start {program}: {e}")),
    };
    let stdout = child.stdout.take().map(capture);
    let stderr = child.stderr.take().map(capture);

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(e) => return failure(format!("Could not wait for {program}: {e}")),
        }
    };
    let out = stdout.and_then(|h| h.join().ok()).unwrap_or_default();
    let err = stderr.and_then(|h| h.join().ok()).unwrap_or_default();

    match status {
        None => failure(format!("Timed out after {} s", timeout.as_secs())),
        Some(status) if status.success() => CommandOutcome {
            ok: true,
            message: first_line(&out),
            error: None,
        },
        Some(status) => {
            let code = status
                .code()
                .map_or("a signal".to_string(), |c| format!("exit {c}"));
            let detail = last_line(&err).or_else(|| last_line(&out));
            failure(match detail {
                Some(detail) => format!("{code}: {detail}"),
                None => code,
            })
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn request(argv: &[&str], timeout: u64) -> CommandRequest {
        CommandRequest {
            argv: argv.iter().map(|s| s.to_string()).collect(),
            timeout_seconds: timeout,
            env: BTreeMap::new(),
        }
    }

    #[test]
    fn returns_the_first_non_empty_stdout_line_on_success() {
        let dir = tempfile::tempdir().unwrap();
        let outcome = run_command(
            dir.path(),
            request(
                &["/bin/sh", "-c", "printf '\\n  hello there\\nsecond\\n'"],
                5,
            ),
        );
        assert_eq!(
            outcome,
            CommandOutcome {
                ok: true,
                message: Some("hello there".into()),
                error: None
            }
        );
    }

    #[test]
    fn success_without_output_has_no_message() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            run_command(dir.path(), request(&["/usr/bin/true"], 5)).message,
            None
        );
    }

    #[test]
    fn reports_the_exit_code_and_last_stderr_line_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let outcome = run_command(
            dir.path(),
            request(
                &["/bin/sh", "-c", "echo first >&2; echo boom >&2; exit 3"],
                5,
            ),
        );
        assert_eq!(outcome.error.as_deref(), Some("exit 3: boom"));
        assert!(!outcome.ok);
    }

    #[test]
    fn runs_in_the_vault_with_the_given_environment_and_no_shell_expansion() {
        let dir = tempfile::tempdir().unwrap();
        let mut req = request(&["/bin/sh", "-c", "pwd; echo $TOLARIA_NEW"], 5);
        req.env.insert("TOLARIA_NEW".into(), "done".into());
        let outcome = run_command(dir.path(), req);
        assert!(outcome
            .message
            .unwrap()
            .ends_with(dir.path().file_name().unwrap().to_str().unwrap()));

        let literal = run_command(dir.path(), request(&["/bin/echo", "$HOME;ls"], 5));
        assert_eq!(literal.message.as_deref(), Some("$HOME;ls"));
    }

    #[test]
    fn kills_a_program_that_outlives_its_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let started = Instant::now();
        let outcome = run_command(dir.path(), request(&["/bin/sleep", "30"], 1));
        assert_eq!(outcome.error.as_deref(), Some("Timed out after 1 s"));
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn refuses_relative_programs_and_reports_a_missing_one() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run_command(dir.path(), request(&["python3"], 5))
            .error
            .unwrap()
            .contains("absolute"));
        assert!(run_command(dir.path(), request(&[], 5))
            .error
            .unwrap()
            .contains("No program"));
        assert!(run_command(dir.path(), request(&["/no/such/program"], 5))
            .error
            .unwrap()
            .contains("Could not start"));
    }
}
