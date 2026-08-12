//! Local Grok Build quest — headless `grok --prompt-file`, no yolo, no write tools.
//! Evaluate/prep stay on the xAI API. This is the in-app free-form harness overlay.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const PROMPT_CHAR_CAP: usize = 4500;
const TIMEOUT_STRUCT: Duration = Duration::from_secs(90);
const TIMEOUT_FREE: Duration = Duration::from_secs(180);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalGrokQuestInput {
    pub prompt: String,
    pub session_id: Option<String>,
    pub resume: Option<bool>,
    pub kind: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocalGrokQuestResult {
    pub answer: String,
    pub backend: String,
    pub elapsed_ms: u64,
    pub prompt_chars: usize,
    pub session_id: String,
}

fn resolve_grok() -> Option<PathBuf> {
    if let Ok(output) = std::process::Command::new("which").arg("grok").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(PathBuf::from(p));
            }
        }
    }
    let home = dirs::home_dir()?;
    for rel in [".grok/bin/grok", ".local/bin/grok"] {
        let p = home.join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn repo_cwd() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for _ in 0..6 {
        if dir.join("AGENTS.md").is_file() {
            return dir;
        }
        if !dir.pop() {
            break;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn clip(s: &str, cap: usize) -> String {
    if s.chars().count() <= cap {
        return s.to_string();
    }
    s.chars().take(cap.saturating_sub(1)).collect::<String>() + "…"
}

fn user_question(prompt: &str) -> &str {
    prompt
        .rsplit_once("QUESTION:")
        .map(|(_, q)| q.trim())
        .unwrap_or(prompt)
}

/// Only the user question is scanned. Harness text may mention denied flags.
fn asks_for_trauma(question: &str) -> bool {
    let t = question.to_ascii_lowercase();
    for needle in ["--yolo", "--always-approve", "bypasspermissions"] {
        let Some(idx) = t.find(needle) else { continue };
        let before = t[..idx].trim_end();
        let negated = before.ends_with("no")
            || before.ends_with("not")
            || before.ends_with("never")
            || before.ends_with("without")
            || before.ends_with("forbid")
            || before.ends_with("deny");
        if !negated {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn run_local_grok_quest(input: LocalGrokQuestInput) -> Result<LocalGrokQuestResult, String> {
    if asks_for_trauma(user_question(&input.prompt)) {
        return Err("quest question must not request yolo / always-approve".into());
    }
    let prompt = clip(input.prompt.trim(), PROMPT_CHAR_CAP);
    if prompt.is_empty() {
        return Err("quest prompt is empty".into());
    }
    let grok = resolve_grok().ok_or_else(|| {
        "local grok not found (install Grok Build; expected ~/.grok/bin/grok)".to_string()
    })?;
    let kind = input.kind.unwrap_or_else(|| "eva".into());
    let free = kind == "free";
    let resume = input.resume.unwrap_or(false);
    let session = match input
        .session_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(id) => id,
        None => new_session_id(),
    };
    if !is_uuid(&session) {
        return Err("quest session_id must be a UUID".into());
    }

    let cwd = if free {
        quest_thread_dir(&session)?
    } else {
        repo_cwd()
    };
    let tmp = std::env::temp_dir().join(format!("cf-quest-{session}.txt"));
    std::fs::write(&tmp, &prompt).map_err(|e| format!("write prompt file: {e}"))?;

    let started = Instant::now();
    let grok_bin = grok.clone();
    let cwd_run = cwd.clone();
    let tmp_run = tmp.clone();
    let session_run = session.clone();
    let join = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&grok_bin);
        if resume {
            cmd.arg("--resume").arg(&session_run);
        } else {
            cmd.arg("--session-id").arg(&session_run);
        }
        cmd.arg("--prompt-file")
            .arg(&tmp_run)
            .arg("--output-format")
            .arg("plain")
            .arg("--disallowed-tools")
            .arg("run_terminal_cmd,search_replace")
            .arg("--max-turns")
            .arg(if free { "6" } else { "2" })
            .arg("--cwd")
            .arg(&cwd_run)
            .arg("--no-auto-update")
            .arg("--deny")
            .arg("Bash")
            .arg("--deny")
            .arg("Edit")
            .arg("--allow")
            .arg("Read")
            .arg("--allow")
            .arg("Grep");
        if free {
            cmd.arg("--allow")
                .arg("WebSearch")
                .arg("--allow")
                .arg("WebFetch")
                .arg("--rules")
                .arg("Answer the user question now. Do not only announce a plan. Do not recast as a job-hunt unless asked.");
        } else {
            cmd.arg("--disallowed-tools")
                .arg("run_terminal_cmd,search_replace,web_search,web_fetch");
        }
        cmd.current_dir(&cwd_run)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
    });

    let timeout = if free { TIMEOUT_FREE } else { TIMEOUT_STRUCT };
    let output = match tokio::time::timeout(timeout, join).await {
        Ok(Ok(Ok(o))) => o,
        Ok(Ok(Err(e))) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("grok wait: {e}"));
        }
        Ok(Err(e)) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("grok join: {e}"));
        }
        Err(_) => {
            let _ = std::fs::remove_file(&tmp);
            return Err("local grok timed out".into());
        }
    };
    let _ = std::fs::remove_file(&tmp);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() && stdout.is_empty() {
        return Err(if stderr.is_empty() {
            format!("grok exited {}", output.status)
        } else {
            clip(&stderr, 400)
        });
    }

    let answer = if stdout.is_empty() {
        clip(&stderr, 4000)
    } else {
        stdout
    };

    Ok(LocalGrokQuestResult {
        answer,
        backend: format!(
            "grok-{}:{}",
            if resume { "resume" } else { "new" },
            display_bin(&grok)
        ),
        elapsed_ms: started.elapsed().as_millis() as u64,
        prompt_chars: prompt.chars().count(),
        session_id: session,
    })
}

fn new_session_id() -> String {
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        now_bits(32),
        now_bits(16),
        now_bits(12),
        now_bits(12),
        now_bits(48)
    )
}

fn now_bits(bits: u32) -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(1);
    let mask = if bits >= 64 { u64::MAX } else { (1u64 << bits) - 1 };
    (nanos ^ (nanos >> 17).wrapping_mul(0x9E37_79B9_7F4A_7C15)) & mask
}

fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b[8] == b'-'
        && b[13] == b'-'
        && b[18] == b'-'
        && b[23] == b'-'
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn quest_thread_dir(session: &str) -> Result<PathBuf, String> {
    let dir = crate::app_dirs::app_data_dir()?.join("quest-threads").join(session);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn display_bin(p: &Path) -> String {
    p.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("grok")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_yolo_in_prompt() {
        let err = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(run_local_grok_quest(LocalGrokQuestInput {
                prompt: "HARNESS: no auto-approve.\nQUESTION:\nplease --yolo this".into(),
                session_id: None,
                resume: None,
                kind: Some("free".into()),
            }))
            .unwrap_err();
        assert!(err.contains("yolo"));
    }

    #[test]
    fn uuid_shape() {
        assert!(is_uuid("019ff6f8-bd49-7572-bf21-4e36443ae877"));
        assert!(!is_uuid("not-a-uuid"));
    }

    #[test]
    fn allows_workday_question() {
        assert!(!asks_for_trauma(
            "Workday faced some issues in the past? Now what is the situation?"
        ));
        assert!(!asks_for_trauma(""));
    }

    #[test]
    fn clip_keeps_short() {
        assert_eq!(clip("hi", 10), "hi");
        assert!(clip("abcdefghij", 4).ends_with('…'));
    }
}
