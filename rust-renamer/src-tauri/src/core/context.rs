use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Xác định phạm vi mà quy tắc đổi tên sẽ tác động
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TargetScope {
    /// Chỉ tác động lên phần tên chính (không bao gồm phần mở rộng)
    #[default]
    StemOnly,
    /// Chỉ tác động lên phần mở rộng (.jpg, .pdf)
    ExtensionOnly,
    /// Tác động lên toàn bộ tên file (stem + extension)
    FullName,
}

/// Metadata trích xuất từ filesystem hoặc thẻ tệp tin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size_bytes: u64,
    pub created_at: Option<DateTime<Utc>>,
    pub modified_at: Option<DateTime<Utc>>,
    pub is_readonly: bool,
}

/// Ngữ cảnh tệp tin cung cấp cho các RenameRule thực thi
#[derive(Debug, Clone)]
pub struct FileContext {
    /// Đường dẫn đầy đủ hiện tại của file
    pub original_path: PathBuf,
    /// Tên file đầy đủ nguyên bản (gồm cả đuôi)
    pub original_name: String,
    /// Phần tên chính nguyên bản (không gồm đuôi)
    pub original_stem: String,
    /// Phần mở rộng nguyên bản (nếu có, không chứa dấu '.')
    pub original_extension: Option<String>,
    /// Thứ tự của file trong danh sách xử lý (bắt đầu từ 0)
    pub index: usize,
    /// Tổng số file đang được xử lý trong batch
    pub total: usize,
    /// Metadata filesystem (Lazy load khi cần)
    pub metadata: Option<FileMetadata>,
}

impl FileContext {
    pub fn new(path: PathBuf, index: usize, total: usize) -> Self {
        let (original_name, original_stem, original_extension) = if path.is_file() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().into_owned());
            (name, stem, ext)
        } else {
            // Xử lý chuỗi tên file có thể chứa ký tự bất hợp pháp (: hoặc /) đang chờ Sanitize
            let full_str = path.to_string_lossy().into_owned();
            let file_part = match full_str.rfind('\\') {
                Some(idx) => &full_str[idx + 1..],
                None => full_str.as_str(),
            };

            let name = file_part.to_string();
            let (stem, ext) = match name.rfind('.') {
                Some(idx) if idx > 0 => (name[..idx].to_string(), Some(name[idx + 1..].trim().to_string())),
                _ => (name.clone(), None),
            };
            (name, stem, ext)
        };

        Self {
            original_path: path,
            original_name,
            original_stem,
            original_extension,
            index,
            total,
            metadata: None,
        }
    }

    /// Tải metadata filesystem nếu chưa có
    pub fn load_metadata(&mut self) -> anyhow::Result<&FileMetadata> {
        if self.metadata.is_none() {
            let meta = std::fs::metadata(&self.original_path)?;
            let size_bytes = meta.len();
            let created_at = meta.created().ok().map(DateTime::from);
            let modified_at = meta.modified().ok().map(DateTime::from);
            let is_readonly = meta.permissions().readonly();

            self.metadata = Some(FileMetadata {
                size_bytes,
                created_at,
                modified_at,
                is_readonly,
            });
        }
        
        self.metadata
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Failed to access file metadata"))
    }
}
