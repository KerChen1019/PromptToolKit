use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde_json::json;

pub async fn messages_completion(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> AppResult<String> {
    let url = messages_endpoint(base_url);
    let payload = json!({
      "model": model,
      "max_tokens": 1024,
      "system": system,
      "messages": [
        {"role":"user","content": user}
      ]
    });
    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(AppError::BadRequest(format!(
            "anthropic HTTP {}: {}",
            status,
            body
        )));
    }
    parse_anthropic_content(&body)
}

pub fn parse_anthropic_content(body: &str) -> AppResult<String> {
    let value: serde_json::Value = serde_json::from_str(body)?;
    let content = value
        .get("content")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("text"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing content[0].text in anthropic response".to_string()))?;
    Ok(content.to_string())
}

fn trim_right_slash(input: &str) -> String {
    input.trim_end_matches('/').to_string()
}

pub fn messages_endpoint(base_url: &str) -> String {
    format!("{}/v1/messages", trim_right_slash(base_url))
}

#[cfg(test)]
mod tests {
    use super::{messages_completion, messages_endpoint, parse_anthropic_content};
    use httpmock::Method::POST;
    use httpmock::MockServer;
    use reqwest::Client;

    #[test]
    fn parse_anthropic_text() {
        let body = r#"{"content":[{"type":"text","text":"abc"}]}"#;
        assert_eq!(parse_anthropic_content(body).unwrap(), "abc");
    }

    #[test]
    fn endpoint_trims_trailing_slash() {
        assert_eq!(
            messages_endpoint("https://api.anthropic.com/"),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[tokio::test]
    async fn anthropic_mock_integration() {
        let server = MockServer::start_async().await;
        let mock = server
            .mock_async(|when, then| {
                when.method(POST).path("/v1/messages");
                then.status(200)
                    .header("content-type", "application/json")
                    .body(r#"{"content":[{"type":"text","text":"anthropic-ok"}]}"#);
            })
            .await;

        let client = Client::new();
        let text = messages_completion(
            &client,
            &server.base_url(),
            "k",
            "claude-3-5-sonnet-latest",
            "system",
            "user",
        )
        .await
        .unwrap();
        mock.assert_async().await;
        assert_eq!(text, "anthropic-ok");
    }
}
