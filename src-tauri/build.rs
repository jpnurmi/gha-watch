use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    emit_git_rerun_paths();
    println!("cargo:rustc-env=GHA_WATCH_BUILD_SHA={}", build_sha());

    tauri_build::build();
}

fn emit_git_rerun_paths() {
    for path in [
        git_path("HEAD"),
        symbolic_head().and_then(|head| git_path(&head)),
    ]
    .into_iter()
    .flatten()
    {
        println!("cargo:rerun-if-changed={path}");
    }
}

fn symbolic_head() -> Option<String> {
    git_output(&["symbolic-ref", "-q", "HEAD"])
}

fn git_path(path: &str) -> Option<String> {
    git_output(&["rev-parse", "--git-path", path])
}

fn git_output(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    let value = String::from_utf8(output.stdout).ok()?.trim().to_string();

    (output.status.success() && !value.is_empty()).then_some(value)
}

fn build_sha() -> String {
    env::var("GITHUB_SHA")
        .ok()
        .filter(|sha| is_sha1(sha))
        .or_else(|| {
            let sha = git_output(&["rev-parse", "HEAD"])?;

            is_sha1(&sha).then_some(sha)
        })
        .unwrap_or_else(|| "unknown".to_string())
}

fn is_sha1(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
