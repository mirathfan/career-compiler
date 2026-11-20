use reqwest::{Client, Url};
use serde_json::Value;
use std::time::Duration;

const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;
const ALLOWED_HOSTS: [&str; 4] = [
    "boards-api.greenhouse.io",
    "api.lever.co",
    "api.eu.lever.co",
    "api.ashbyhq.com",
];

fn validate_public_job_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw)
        .map_err(|_| "job_source_url_invalid|The job-source URL is invalid.".to_string())?;
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || url.fragment().is_some()
    {
        return Err("job_source_url_blocked|Only HTTPS job-source URLs are allowed.".to_string());
    }
    let host = url.host_str().unwrap_or_default();
    if !ALLOWED_HOSTS.contains(&host) {
        return Err(
            "job_source_host_blocked|The requested host is not an approved public ATS endpoint."
                .to_string(),
        );
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(
            "job_source_credentials_blocked|Credentials are not allowed in job-source URLs."
                .to_string(),
        );
    }
    Ok(url)
}

fn http_failure(status: u16) -> (&'static str, &'static str) {
    match status {
        300..=399 => ("job_source_redirect_blocked", "The job source redirected outside the permitted retrieval path. Paste the job description instead."),
        401 => ("job_source_auth_required", "This job source requires authentication; authenticated retrieval is not supported."),
        403 => ("job_source_access_denied", "This job source denied access. Paste the job description instead."),
        404 | 410 => ("job_source_not_found", "This job source is unavailable. Check its board identifier; it may have moved or been removed."),
        429 => ("job_source_rate_limited", "This job source is rate limiting requests. Try again later."),
        _ => ("job_source_http_error", "The job source returned an HTTP error. Try again later or paste the description."),
    }
}

fn json_content_type(value: &str) -> bool {
    let mime = value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    mime == "application/json" || (mime.starts_with("application/") && mime.ends_with("+json"))
}

#[tauri::command]
pub async fn fetch_public_job_board(url: String, timeout_ms: u64) -> Result<Value, String> {
    let url = validate_public_job_url(&url)?;
    let timeout = Duration::from_millis(timeout_ms.clamp(1_000, 30_000));
    let client = Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let next = attempt.url();
            let allowed = validate_public_job_url(next.as_str()).is_ok();
            if allowed && attempt.previous().len() < 3 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| {
            "job_source_client_failed|The public job-source client could not be created."
                .to_string()
        })?;

    let mut last_code = "job_source_fetch_failed";
    for attempt in 0..2 {
        let response = match client
            .get(url.clone())
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) if attempt == 0 => continue,
            Err(error) => {
                let (code, message) = if error.is_timeout() {
                    (
                        "job_source_timeout",
                        "The job source timed out. Try again later or paste the description.",
                    )
                } else if error.is_connect() {
                    ("job_source_network_unavailable", "The job source could not be reached. Check your connection or try again later; this does not establish that all internet access is unavailable.")
                } else {
                    (
                        "job_source_fetch_failed",
                        "The job source request failed. Try again later or paste the description.",
                    )
                };
                return Err(format!("{code}|{message}"));
            }
        };
        let status = response.status();
        if !status.is_success() {
            let (code, message) = http_failure(status.as_u16());
            last_code = code;
            if status.is_server_error() && attempt == 0 {
                continue;
            }
            return Err(format!("{code}|{message}"));
        }
        if !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(json_content_type)
        {
            return Err("job_source_content_type|The job source did not return JSON. A sign-in or HTML page cannot be imported by this ATS adapter.".to_string());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(
                "job_source_too_large|The public job-source response exceeded 5 MB.".to_string(),
            );
        }
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| {
            "job_source_read_failed|The public job-source response could not be read.".to_string()
        })? {
            if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
                return Err(
                    "job_source_too_large|The public job-source response exceeded 5 MB."
                        .to_string(),
                );
            }
            bytes.extend_from_slice(&chunk);
        }
        return serde_json::from_slice(&bytes).map_err(|_| {
            "job_source_json_invalid|The public job source did not return valid JSON.".to_string()
        });
    }
    Err(format!(
        "{last_code}|The public job source could not be reached."
    ))
}

#[cfg(test)]
mod tests {
    use super::{http_failure, json_content_type, validate_public_job_url};

    #[test]
    fn allows_only_known_https_job_hosts() {
        assert!(
            validate_public_job_url("https://api.ashbyhq.com/posting-api/job-board/example")
                .is_ok()
        );
        assert!(validate_public_job_url("https://api.lever.co/v0/postings/example").is_ok());
        assert!(validate_public_job_url("http://api.lever.co/v0/postings/example").is_err());
        assert!(validate_public_job_url("https://example.com/jobs").is_err());
        assert!(validate_public_job_url("https://api.lever.co.evil.example/jobs").is_err());
    }

    #[test]
    fn initial_and_redirect_urls_share_strict_validation() {
        for url in [
            "https://api.lever.co:8443/jobs",
            "https://api.lever.co/jobs#fragment",
            "https://user:secret@api.lever.co/jobs",
            "https://127.0.0.1/jobs",
            "https://[::1]/jobs",
            "https://169.254.169.254/jobs",
            "file:///etc/passwd",
            "https://host.internal/jobs",
            "https://www.linkedin.com/jobs/view/123",
        ] {
            assert!(
                validate_public_job_url(url).is_err(),
                "Unexpectedly allowed URL"
            );
        }
    }

    #[test]
    fn distinguishes_external_failures_and_non_json_content() {
        for (status, code) in [
            (302, "job_source_redirect_blocked"),
            (401, "job_source_auth_required"),
            (403, "job_source_access_denied"),
            (404, "job_source_not_found"),
            (410, "job_source_not_found"),
            (429, "job_source_rate_limited"),
            (503, "job_source_http_error"),
        ] {
            assert_eq!(http_failure(status).0, code);
        }
        assert!(json_content_type("application/json; charset=utf-8"));
        assert!(json_content_type("application/problem+json"));
        assert!(!json_content_type("text/html"));
        assert!(!json_content_type(""));
    }
}
