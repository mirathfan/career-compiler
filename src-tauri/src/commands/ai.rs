use crate::keychain::{resolve_openai_key, KeyringSecretStore};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeJobRequest {
  pub model: String,
  pub job_description: String,
  pub company: String,
  pub role_title: String,
  pub schema: Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIContent {
  #[serde(rename = "type")]
  content_type: Option<String>,
  text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIOutput {
  content: Option<Vec<OpenAIContent>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIResponse {
  output_text: Option<String>,
  output: Option<Vec<OpenAIOutput>>,
  error: Option<Value>,
}

#[tauri::command]
pub async fn analyze_job_with_openai(request: AnalyzeJobRequest) -> Result<String, String> {
  let key = resolve_openai_key(&KeyringSecretStore)?;
  let client = reqwest::Client::new();
  let response = client
    .post("https://api.openai.com/v1/responses")
    .bearer_auth(key)
    .json(&json!({
      "model": request.model,
      "input": [
        {
          "role": "system",
          "content": "You analyze job descriptions for an evidence-grounded resume compiler. Return only JSON that conforms to the provided schema. Do not invent candidate facts."
        },
        {
          "role": "user",
          "content": format!(
            "Company hint: {}\nRole title hint: {}\n\nJob description:\n{}",
            request.company, request.role_title, request.job_description
          )
        }
      ],
      "text": {
        "format": {
          "type": "json_schema",
          "name": "job_analysis",
          "strict": true,
          "schema": request.schema
        }
      }
    }))
    .send()
    .await
    .map_err(|error| format!("OpenAI network failure: {error}"))?;

  let status = response.status();
  let body = response
    .text()
    .await
    .map_err(|error| format!("Could not read OpenAI response: {error}"))?;

  if !status.is_success() {
    return Err(openai_status_error(status, &body));
  }

  let parsed: OpenAIResponse = serde_json::from_str(&body)
    .map_err(|error| format!("Malformed OpenAI response JSON: {error}"))?;
  if let Some(output_text) = parsed.output_text {
    return Ok(output_text);
  }
  if let Some(output) = parsed.output {
    for item in output {
      if let Some(content) = item.content {
        for part in content {
          if let Some(text) = part.text {
            return Ok(text);
          }
        }
      }
    }
  }
  Err("OpenAI response did not include structured output text.".to_string())
}

fn openai_status_error(status: StatusCode, body: &str) -> String {
  match status {
    StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
      "OpenAI authentication failed. Replace the API key in Settings.".to_string()
    }
    StatusCode::TOO_MANY_REQUESTS => "OpenAI rate limit reached. Try again later.".to_string(),
    StatusCode::BAD_REQUEST => format!("OpenAI rejected the structured request: {body}"),
    _ => format!("OpenAI request failed with status {status}: {body}"),
  }
}
