pub mod ai_repo;
pub mod ai_run_repo;
pub mod output_repo;
pub mod project_repo;
pub mod prompt_repo;
pub mod reference_repo;
pub mod snippet_repo;

use chrono::Utc;
use uuid::Uuid;

pub fn now() -> String {
    Utc::now().to_rfc3339()
}

pub fn id() -> String {
    Uuid::new_v4().to_string()
}
