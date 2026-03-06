use crate::{
    ai::providers,
    error::AppResult,
    models::{AIProvider, ProviderKind},
};
use reqwest::Client;
use std::time::Duration;

pub async fn generate_text(
    provider: &AIProvider,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()?;
    match provider.kind {
        ProviderKind::OpenaiCompatible => {
            providers::openai_compatible::chat_completion(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                user_prompt,
            )
            .await
        }
        ProviderKind::Openai => {
            providers::openai::chat_completion(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                user_prompt,
            )
            .await
        }
        ProviderKind::Anthropic => {
            providers::anthropic::messages_completion(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                user_prompt,
            )
            .await
        }
        ProviderKind::Gemini => {
            providers::gemini::generate_content(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                user_prompt,
            )
            .await
        }
    }
}
