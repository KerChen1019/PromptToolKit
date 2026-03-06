use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde_json::json;

pub async fn generate_content(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> AppResult<String> {
    let url = generate_endpoint(base_url, model, api_key);
    let payload = json!({
      "systemInstruction": {
        "parts": [{ "text": system }]
      },
      "contents": [{
        "role":"user",
        "parts":[{ "text": user }]
      }]
    });
    let response = client.post(url).json(&payload).send().await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(AppError::BadRequest(format!(
            "gemini HTTP {}: {}",
            status,
            body
        )));
    }
    parse_gemini_content(&body)
}

pub fn parse_gemini_content(body: &str) -> AppResult<String> {
    let value: serde_json::Value = serde_json::from_str(body)?;
    let text = value
        .get("candidates")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("parts"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("text"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing candidates[0].content.parts[0].text".to_string()))?;
    Ok(text.to_string())
}

fn trim_right_slash(input: &str) -> String {
    input.trim_end_matches('/').to_string()
}

pub fn generate_endpoint(base_url: &str, model: &str, api_key: &str) -> String {
    format!(
        "{}/v1beta/models/{}:generateContent?key={}",
        trim_right_slash(base_url),
        model,
        api_key
    )
}

#[cfg(test)]
mod tests {
    use super::{generate_content, generate_endpoint, parse_gemini_content};
    use httpmock::Method::POST;
    use httpmock::MockServer;
    use reqwest::Client;

    #[test]
    fn parse_gemini_text() {
        let body = r#"{"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}"#;
        assert_eq!(parse_gemini_content(body).unwrap(), "hello");
    }

    #[test]
    fn endpoint_includes_model_and_key() {
        let endpoint = generate_endpoint(
            "https://generativelanguage.googleapis.com/",
            "gemini-2.0-flash",
            "k",
        );
        assert_eq!(
            endpoint,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=k"
        );
    }

    #[tokio::test]
    async fn gemini_mock_integration() {
        let server = MockServer::start_async().await;
        let mock = server
            .mock_async(|when, then| {
                when.method(POST)
                    .path("/v1beta/models/gemini-2.0-flash:generateContent")
                    .query_param("key", "k");
                then.status(200)
                    .header("content-type", "application/json")
                    .body(r#"{"candidates":[{"content":{"parts":[{"text":"gemini-ok"}]}}]}"#);
            })
            .await;

        let client = Client::new();
        let text = generate_content(
            &client,
            &server.base_url(),
            "k",
            "gemini-2.0-flash",
            "system",
            "user",
        )
        .await
        .unwrap();
        mock.assert_async().await;
        assert_eq!(text, "gemini-ok");
    }
}
