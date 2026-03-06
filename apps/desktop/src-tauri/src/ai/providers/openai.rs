use crate::error::AppResult;
use reqwest::Client;

pub async fn chat_completion(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> AppResult<String> {
    super::openai_compatible::chat_completion(client, base_url, api_key, model, system, user).await
}
