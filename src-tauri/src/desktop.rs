use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub(crate) fn open_github_url(app: AppHandle, url: String) -> Result<(), String> {
    if !is_verified_github_url(&url) {
        return Err("Only HTTPS GitHub repository links can be opened.".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

pub(crate) fn is_verified_github_url(url: &str) -> bool {
    let Ok(parsed) = tauri::Url::parse(url) else {
        return false;
    };
    !url.chars().any(|ch| ch.is_whitespace() || ch.is_control())
        && parsed.scheme() == "https"
        && parsed.host_str() == Some("github.com")
        && parsed.port_or_known_default() == Some(443)
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed
            .path()
            .split('/')
            .filter(|part| !part.is_empty())
            .count()
            >= 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_repository_and_run_links() {
        assert!(is_verified_github_url(
            "https://github.com/jpnurmi/gha-watch"
        ));
        assert!(is_verified_github_url(
            "https://github.com/jpnurmi/gha-watch/actions/runs/123#jobs"
        ));
    }

    #[test]
    fn rejects_other_schemes_hosts_and_credentials() {
        for url in [
            "file:///tmp/file",
            "http://github.com/a/b",
            "https://github.com.evil.example/a/b",
            "https://user@github.com/a/b",
            "https://github.com:8443/a/b",
            "https://github.com/a?b=c",
            "https://github.com/a/\nb",
        ] {
            assert!(!is_verified_github_url(url), "{url}");
        }
    }
}
