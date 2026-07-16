use crate::keychain::{resolve_openai_key, KeyringSecretStore};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOpenAIRequest {
    pub model: String,
    pub request_type: String,
    pub instructions: String,
    pub input: Value,
    pub schema_name: String,
    pub schema: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeJobRequest {
    pub model: String,
    pub job_description: String,
    pub company: String,
    pub role_title: String,
    pub schema: Value,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct OpenAIUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    total_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OpenAIContent {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIOutput {
    content: Option<Vec<OpenAIContent>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    output_text: Option<String>,
    output: Option<Vec<OpenAIOutput>>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOpenAIResponse {
    output_text: String,
    duration_ms: u128,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    total_tokens: Option<u64>,
}

fn build_request_body(request: &StructuredOpenAIRequest) -> Value {
    json!({
        "model": request.model,
        "input": [
            { "role": "system", "content": request.instructions },
            { "role": "user", "content": serde_json::to_string(&request.input).unwrap_or_default() }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": request.schema_name,
                "strict": true,
                "schema": request.schema
            }
        },
        "metadata": { "request_type": request.request_type }
    })
}

fn parse_structured_response(
    body: &str,
    duration_ms: u128,
) -> Result<StructuredOpenAIResponse, String> {
    let parsed: OpenAIResponse = serde_json::from_str(body).map_err(|_| {
        "structured_response_rejected|OpenAI returned malformed response JSON.".to_string()
    })?;
    let output_text = parsed.output_text.or_else(|| {
        parsed.output.and_then(|output| {
            output
                .into_iter()
                .flat_map(|item| item.content.unwrap_or_default())
                .find_map(|part| part.text)
        })
    });
    let output_text = output_text.ok_or_else(|| {
        "structured_response_rejected|OpenAI response did not include structured output text."
            .to_string()
    })?;
    let usage = parsed.usage.unwrap_or_default();
    Ok(StructuredOpenAIResponse {
        output_text,
        duration_ms,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
    })
}

async fn execute_structured_openai(
    request: StructuredOpenAIRequest,
) -> Result<StructuredOpenAIResponse, String> {
    let key = resolve_openai_key(&KeyringSecretStore)?;
    let started = Instant::now();
    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(key)
        .json(&build_request_body(&request))
        .send()
        .await
        .map_err(|_| {
            "network_failure|Could not reach OpenAI. Check the network and retry.".to_string()
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|_| {
        "network_failure|Could not read the OpenAI response. Retry the request.".to_string()
    })?;

    if !status.is_success() {
        return Err(openai_status_error(status, &body));
    }
    parse_structured_response(&body, started.elapsed().as_millis())
}

#[tauri::command]
pub async fn run_openai_structured(
    request: StructuredOpenAIRequest,
) -> Result<StructuredOpenAIResponse, String> {
    execute_structured_openai(request).await
}

#[tauri::command]
pub async fn analyze_job_with_openai(request: AnalyzeJobRequest) -> Result<String, String> {
    let response = execute_structured_openai(StructuredOpenAIRequest {
        model: request.model,
        request_type: "job_analysis".to_string(),
        instructions: "Analyze the job description for an evidence-grounded resume compiler. Return only the required structured response.".to_string(),
        input: json!({
            "company": request.company,
            "roleTitle": request.role_title,
            "jobDescription": request.job_description,
        }),
        schema_name: "job_analysis".to_string(),
        schema: request.schema,
    })
    .await?;
    Ok(response.output_text)
}

fn openai_status_error(status: StatusCode, body: &str) -> String {
    let code = extract_error_code(body);
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            "invalid_api_key|OpenAI authentication failed. Replace the API key in Settings."
                .to_string()
        }
        StatusCode::TOO_MANY_REQUESTS => {
            "rate_limit|OpenAI rate limit reached. Retry after a short delay.".to_string()
        }
        StatusCode::BAD_REQUEST => {
            let safe_code = code.unwrap_or_default();
            if safe_code.contains("model") || safe_code.contains("not_found") {
                "unsupported_model|The configured OpenAI model is unavailable or unsupported."
                    .to_string()
            } else if safe_code.contains("schema") || safe_code.contains("format") {
                "schema_rejection|OpenAI rejected the structured response schema.".to_string()
            } else {
                let code_suffix = if safe_code.is_empty() {
                    String::new()
                } else {
                    format!(" ({safe_code})")
                };
                format!(
                    "structured_request_rejected|OpenAI rejected the structured request{}.",
                    code_suffix
                )
            }
        }
        _ if status.is_server_error() => {
            "provider_unavailable|OpenAI is temporarily unavailable. Retry later.".to_string()
        }
        _ => format!("provider_error|OpenAI request failed with HTTP status {status}."),
    }
}

fn extract_error_code(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    let code = parsed.get("error")?.get("code")?.as_str()?;
    let safe: String = code
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '_' || *character == '-'
        })
        .take(64)
        .collect();
    (!safe.is_empty()).then_some(redact_secrets(&safe))
}

fn redact_secrets(value: &str) -> String {
    value
        .split_whitespace()
        .map(|part| {
            if part.starts_with("sk-") || part.starts_with("Bearer sk-") {
                "[REDACTED]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> StructuredOpenAIRequest {
        StructuredOpenAIRequest {
            model: "configured-model".to_string(),
            request_type: "resume_generation".to_string(),
            instructions: "Ground every claim.".to_string(),
            input: json!({ "selectedFacts": [{ "factId": "fact-1" }] }),
            schema_name: "tailored_resume".to_string(),
            schema: json!({ "type": "object", "additionalProperties": false }),
        }
    }

    #[test]
    fn serializes_strict_structured_request_without_a_secret() {
        let body = build_request_body(&request());
        assert_eq!(body["model"], "configured-model");
        assert_eq!(body["text"]["format"]["strict"], true);
        assert_eq!(body["text"]["format"]["name"], "tailored_resume");
        assert!(!body.to_string().contains("sk-"));
    }

    #[test]
    fn safely_parses_output_and_usage() {
        let parsed = parse_structured_response(
            &json!({
                "output_text": "{\"id\":\"resume\"}",
                "usage": { "input_tokens": 12, "output_tokens": 8, "total_tokens": 20 }
            })
            .to_string(),
            14,
        )
        .expect("valid response");
        assert_eq!(parsed.output_text, "{\"id\":\"resume\"}");
        assert_eq!(parsed.input_tokens, Some(12));
        assert_eq!(parsed.total_tokens, Some(20));
    }

    #[test]
    fn maps_provider_errors_without_returning_response_body() {
        let body =
            r#"{"error":{"code":"invalid_schema","message":"contact@example.com sk-secret"}}"#;
        let mapped = openai_status_error(StatusCode::BAD_REQUEST, body);
        assert!(mapped.starts_with("schema_rejection|"));
        assert!(!mapped.contains("invalid_schema"));
        assert!(!mapped.contains("contact@example.com"));
        assert!(!mapped.contains("sk-secret"));
    }

    #[test]
    fn redacts_secret_tokens() {
        let redacted = redact_secrets("request failed for sk-test-secret at endpoint");
        assert_eq!(redacted, "request failed for [REDACTED] at endpoint");
    }
}
