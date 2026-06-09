//! Minimal xAI client for collab-finder (grok-4.3 default).
//! Uses the official OpenAI-compatible endpoint with strict json_schema for structured outputs.
//! All calls go through secrets::get_xai_key() — key never leaves Rust.
//!
//! Pricing (hardcoded for estimates; real costs from API usage):
//!   grok-4.3: $1.25 / M input, $2.50 / M output

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const XAI_BASE: &str = "https://api.x.ai/v1";
const DEFAULT_MODEL: &str = "grok-4.3";

// Hardcoded for pre-flight estimates and UI (see plan).
// Real incurred cost is always computed from the response "usage" object.
const PRICE_INPUT_PER_M: f64 = 1.25;
const PRICE_OUTPUT_PER_M: f64 = 2.50;

#[derive(Debug, Serialize, Deserialize)]
pub struct XaiUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct XaiChatResponse {
    choices: Option<Vec<ChatChoice>>,
    usage: Option<XaiUsage>,
    error: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatChoice {
    message: Option<ChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

pub fn estimate_cost_usd(input_tokens: u32, output_tokens: u32) -> f64 {
    (input_tokens as f64 * PRICE_INPUT_PER_M + output_tokens as f64 * PRICE_OUTPUT_PER_M)
        / 1_000_000.0
}

/// Perform a chat completion that requests strict JSON schema output.
/// Returns the parsed JSON value (the model is forced to match the schema).
pub async fn structured_chat(
    system: &str,
    user: &str,
    schema_name: &str,
    json_schema: Value,
) -> Result<(Value, XaiUsage), String> {
    let key = crate::secrets::get_xai_key()?;

    let body = json!({
        "model": DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": true,
                "schema": json_schema
            }
        }
    });

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(format!("{}/chat/completions", XAI_BASE))
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("xAI request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("xAI error ({}): {}", status, text));
    }

    let parsed: XaiChatResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse xAI response: {} — body: {}", e, text))?;

    if let Some(err) = parsed.error {
        return Err(format!("xAI returned error: {}", err));
    }

    let content = parsed
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|ch| ch.message)
        .and_then(|m| m.content)
        .ok_or_else(|| "No content in xAI response".to_string())?;

    let value: Value = serde_json::from_str(&content)
        .map_err(|e| format!("xAI did not return valid JSON matching schema: {}", e))?;

    let usage = parsed.usage.unwrap_or(XaiUsage {
        prompt_tokens: None,
        completion_tokens: None,
        total_tokens: None,
    });

    Ok((value, usage))
}

/// Convenience: compute real cost from usage + our prices.
pub fn cost_from_usage(usage: &XaiUsage) -> f64 {
    let input = usage.prompt_tokens.unwrap_or(0);
    let output = usage.completion_tokens.unwrap_or(0);
    estimate_cost_usd(input, output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cost_estimation_is_sane() {
        // 2000 input + 800 output for a typical target analysis + prep
        let usd = estimate_cost_usd(2000, 800);
        assert!(usd > 0.0 && usd < 0.01, "unexpected cost: {}", usd);
    }

    #[test]
    fn cost_from_usage_matches() {
        let u = XaiUsage {
            prompt_tokens: Some(1200),
            completion_tokens: Some(650),
            total_tokens: Some(1850),
        };
        let c = cost_from_usage(&u);
        let expected = estimate_cost_usd(1200, 650);
        assert!((c - expected).abs() < 0.000001);
    }
}
