use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde_json::json;

pub async fn chat_completion(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> AppResult<String> {
    let url = chat_endpoint(base_url);
    let payload = json!({
      "model": model,
      "temperature": 0.7,
      "messages": [
        {"role":"system","content": system},
        {"role":"user","content": user}
      ]
    });
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(AppError::BadRequest(format!(
            "openai-compatible HTTP {}: {}",
            status,
            body
        )));
    }
    parse_openai_like_content(&body)
}

pub fn parse_openai_like_content(body: &str) -> AppResult<String> {
    let value: serde_json::Value = serde_json::from_str(body)?;
    let content = value
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("message"))
        .and_then(|v| v.get("content"))
        .ok_or_else(|| AppError::BadRequest("missing choices[0].message.content".to_string()))?;

    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }

    if let Some(array) = content.as_array() {
        let mut combined = String::new();
        for part in array {
            if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                combined.push_str(t);
            }
        }
        if !combined.trim().is_empty() {
            return Ok(combined);
        }
    }

    Err(AppError::BadRequest(
        "unsupported content format in OpenAI-compatible response".to_string(),
    ))
}

fn trim_right_slash(input: &str) -> String {
    input.trim_end_matches('/').to_string()
}

pub fn chat_endpoint(base_url: &str) -> String {
    format!("{}/v1/chat/completions", trim_right_slash(base_url))
}

#[cfg(test)]
mod tests {
    use super::{chat_completion, chat_endpoint, parse_openai_like_content};
    use httpmock::Method::POST;
    use httpmock::MockServer;
    use reqwest::Client;

    #[test]
    fn parse_simple_openai_content() {
        let body = r#"{"choices":[{"message":{"content":"hello world"}}]}"#;
        let text = parse_openai_like_content(body).unwrap();
        assert_eq!(text, "hello world");
    }

    #[test]
    fn endpoint_trims_trailing_slash() {
        assert_eq!(
            chat_endpoint("https://api.example.com/"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[tokio::test]
    async fn openai_compatible_mock_integration() {
        let server = MockServer::start_async().await;
        let mock = server
            .mock_async(|when, then| {
                when.method(POST).path("/v1/chat/completions");
                then.status(200)
                    .header("content-type", "application/json")
                    .body(r#"{"choices":[{"message":{"content":"ok-from-mock"}}]}"#);
            })
            .await;

        let client = Client::new();
        let text = chat_completion(
            &client,
            &server.base_url(),
            "k",
            "gpt-test",
            "system",
            "user",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        assert_eq!(text, "ok-from-mock");
    }
}
