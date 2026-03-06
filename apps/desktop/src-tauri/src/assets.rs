use crate::error::AppResult;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufReader, Read},
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub fn import_asset(asset_dir: &Path, source_path: &str, folder: &str) -> AppResult<(PathBuf, String)> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(crate::error::AppError::BadRequest(format!(
            "source file does not exist: {source_path}"
        )));
    }
    let ext = source
        .extension()
        .map(|v| v.to_string_lossy().to_string())
        .unwrap_or_else(|| "bin".to_string());
    let target_dir = asset_dir.join(folder);
    std::fs::create_dir_all(&target_dir)?;
    let target_path = target_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::copy(&source, &target_path)?;
    let hash = file_hash(&target_path)?;
    Ok((target_path, hash))
}

fn file_hash(path: &Path) -> AppResult<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 16 * 1024];
    loop {
        let bytes = reader.read(&mut buffer)?;
        if bytes == 0 {
            break;
        }
        hasher.update(&buffer[..bytes]);
    }
    let hash = format!("{:x}", hasher.finalize());
    Ok(hash)
}
