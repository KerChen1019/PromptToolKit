use crate::{error::AppResult, models::CopyPayloadV1};
use base64::Engine;
use uuid::Uuid;

const PREFIX: &str = "\u{2063}\u{2063}\u{2063}";
const SUFFIX: &str = "\u{2064}\u{2064}\u{2064}";
const ZERO: char = '\u{200B}';
const ONE: char = '\u{200C}';

pub fn new_payload(project_id: &str, prompt_id: &str, prompt_version_id: &str) -> CopyPayloadV1 {
    CopyPayloadV1 {
        schema: "ptk.copy.v1".to_string(),
        project_id: project_id.to_string(),
        prompt_id: prompt_id.to_string(),
        prompt_version_id: prompt_version_id.to_string(),
        copied_at: chrono::Utc::now().to_rfc3339(),
        nonce: Uuid::new_v4().to_string(),
    }
}

pub fn encode_payload_to_invisible(payload: &CopyPayloadV1) -> AppResult<String> {
    let json = serde_json::to_vec(payload)?;
    let b64 = base64::engine::general_purpose::STANDARD_NO_PAD.encode(json);
    let mut bits = String::with_capacity(b64.len() * 8);
    for byte in b64.bytes() {
        for i in (0..8).rev() {
            let bit = (byte >> i) & 1;
            bits.push(if bit == 0 { ZERO } else { ONE });
        }
    }
    Ok(format!("{PREFIX}{bits}{SUFFIX}"))
}

pub fn decode_payload_from_invisible(text: &str) -> Option<CopyPayloadV1> {
    let (start, end) = find_payload_bounds(text)?;
    let encoded = &text[start + PREFIX.len()..end];
    let mut bytes = Vec::new();
    let mut current = 0_u8;
    let mut count = 0_u8;
    for ch in encoded.chars() {
        let bit = if ch == ZERO {
            0
        } else if ch == ONE {
            1
        } else {
            continue;
        };
        current = (current << 1) | bit;
        count += 1;
        if count == 8 {
            bytes.push(current);
            current = 0;
            count = 0;
        }
    }
    if bytes.is_empty() {
        return None;
    }
    let b64 = String::from_utf8(bytes).ok()?;
    let json = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(b64)
        .ok()?;
    serde_json::from_slice(&json).ok()
}

pub fn append_payload(prompt_text: &str, payload: &CopyPayloadV1) -> AppResult<String> {
    let invisible = encode_payload_to_invisible(payload)?;
    Ok(format!("{prompt_text}{invisible}"))
}

pub fn write_system_clipboard(value: &str) -> AppResult<()> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;
    clipboard
        .set_text(value.to_string())
        .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;
    Ok(())
}

fn find_payload_bounds(text: &str) -> Option<(usize, usize)> {
    let start = text.rfind(PREFIX)?;
    let suffix_rel = text[start + PREFIX.len()..].find(SUFFIX)?;
    let end = start + PREFIX.len() + suffix_rel;
    Some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_roundtrip() {
        let payload = new_payload("p1", "pr1", "v1");
        let encoded = append_payload("hello", &payload).unwrap();
        let decoded = decode_payload_from_invisible(&encoded).unwrap();
        assert_eq!(decoded.schema, "ptk.copy.v1");
        assert_eq!(decoded.project_id, "p1");
        assert_eq!(decoded.prompt_id, "pr1");
        assert_eq!(decoded.prompt_version_id, "v1");
    }

    #[test]
    fn decode_returns_none_without_payload() {
        assert!(decode_payload_from_invisible("plain text only").is_none());
    }
}
