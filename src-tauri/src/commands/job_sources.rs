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
    if url.scheme() != "https" {
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

#[tauri::command]
pub async fn fetch_public_job_board(url: String, timeout_ms: u64) -> Result<Value, String> {
    let url = validate_public_job_url(&url)?;
    let timeout = Duration::from_millis(timeout_ms.clamp(1_000, 30_000));
    let client = Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let next = attempt.url();
            let allowed = next.scheme() == "https"
                && next
                    .host_str()
                    .is_some_and(|host| ALLOWED_HOSTS.contains(&host))
                && next.username().is_empty()
                && next.password().is_none();
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
            Err(_) => {
                return Err(format!(
                    "{last_code}|The public job source could not be reached."
                ))
            }
        };
        let status = response.status();
        if !status.is_success() {
            last_code = if status.as_u16() == 429 {
                "job_source_rate_limited"
            } else {
                "job_source_http_error"
            };
            if status.is_server_error() && attempt == 0 {
                continue;
            }
            return Err(format!(
                "{last_code}|The public job source returned HTTP {}.",
                status.as_u16()
            ));
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
    use super::validate_public_job_url;

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
}
