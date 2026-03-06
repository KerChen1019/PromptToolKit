use crate::{
    models::AttributionCandidate,
    repo::{id, output_repo::CopyEventLite},
};
use chrono::{DateTime, Duration, Utc};

pub fn rank_candidates(
    payload_prompt_version_id: Option<String>,
    events: &[CopyEventLite],
    now: DateTime<Utc>,
    limit: usize,
) -> Vec<AttributionCandidate> {
    let mut out = Vec::<AttributionCandidate>::new();

    if let Some(version_id) = payload_prompt_version_id {
        out.push(AttributionCandidate {
            attribution_id: id(),
            prompt_version_id: version_id,
            score: 10_000,
            reason: "decoded hidden payload".to_string(),
            confirmed: false,
        });
    }

    for event in events {
        let copied_at = DateTime::parse_from_rfc3339(&event.copied_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or(now);
        let delta = (now - copied_at).num_seconds().unsigned_abs() as i64;
        if now - copied_at > Duration::minutes(30) {
            continue;
        }
        let score = 5_000 - delta.min(4_500);
        out.push(AttributionCandidate {
            attribution_id: id(),
            prompt_version_id: event.prompt_version_id.clone(),
            score,
            reason: event.reason.clone(),
            confirmed: false,
        });
    }

    out.sort_by(|a, b| b.score.cmp(&a.score));
    out.dedup_by(|a, b| a.prompt_version_id == b.prompt_version_id);
    out.truncate(limit);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_candidate_should_rank_first() {
        let now = Utc::now();
        let events = vec![CopyEventLite {
            prompt_version_id: "v_old".to_string(),
            copied_at: now.to_rfc3339(),
            reason: "fallback".to_string(),
        }];
        let ranked = rank_candidates(Some("v_payload".to_string()), &events, now, 3);
        assert_eq!(ranked[0].prompt_version_id, "v_payload");
    }
}
