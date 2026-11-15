use crate::core::context::{FileContext, TargetScope};
use crate::core::rule::RenameRule;
use crate::core::transaction::TransactionManager;
use anyhow::Result;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Trạng thái của một tệp tin trong danh sách đổi tên
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RenameStatus {
    /// Đang chờ xử lý (đã tính toán tên mới trên RAM)
    Pending,
    /// Đã thực hiện đổi tên thành công trên filesystem
    Renamed,
    /// Tên không có sự thay đổi
    Unchanged,
    /// Xảy ra xung đột tên (đã được tự động xử lý hậu tố)
    CollisionResolved,
    /// Lỗi trong quá trình tính toán hoặc thực thi
    Failed(String),
}

/// Đại diện cho 1 phần tử tệp tin trong bộ nhớ (Real-time Preview Mapping)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameItem {
    pub original_path: PathBuf,
    pub original_name: String,
    pub new_name: String,
    pub target_path: PathBuf,
    pub status: RenameStatus,
    pub has_collision: bool,
}

/// Bộ máy điều phối đổi tên tập tin đa luồng (Core Renamer Engine)
/// Xử lý song song bằng Rayon trên RAM và liên kết với TransactionManager để commit an toàn.
#[derive(Default)]
pub struct RenamerEngine {
    /// Pipeline chứa chuỗi các quy tắc đổi tên đa hình
    pipeline: Vec<Box<dyn RenameRule>>,
}

impl RenamerEngine {
    /// Khởi tạo engine rỗng
    pub fn new() -> Self {
        Self {
            pipeline: Vec::new(),
        }
    }

    /// Khởi tạo engine nhận trực tiếp một pipeline gồm nhiều `Box<dyn RenameRule>`
    pub fn with_pipeline(pipeline: Vec<Box<dyn RenameRule>>) -> Self {
        Self { pipeline }
    }

    /// Thêm một quy tắc vào pipeline (tự động đóng gói vào Box)
    pub fn add_rule<R: RenameRule + 'static>(&mut self, rule: R) -> &mut Self {
        self.pipeline.push(Box::new(rule));
        self
    }

    /// Thêm trực tiếp một `Box<dyn RenameRule>` vào pipeline
    pub fn add_boxed_rule(&mut self, rule: Box<dyn RenameRule>) -> &mut Self {
        self.pipeline.push(rule);
        self
    }

    /// Gán mới toàn bộ pipeline
    pub fn set_pipeline(&mut self, pipeline: Vec<Box<dyn RenameRule>>) {
        self.pipeline = pipeline;
    }

    /// Lấy tham chiếu đến các quy tắc trong pipeline
    pub fn pipeline(&self) -> &[Box<dyn RenameRule>] {
        &self.pipeline
    }

    /// Xóa toàn bộ quy tắc
    pub fn clear_rules(&mut self) {
        self.pipeline.clear();
    }

    /// Trả về số lượng quy tắc trong pipeline
    pub fn rule_count(&self) -> usize {
        self.pipeline.len()
    }

    /// Áp dụng tuần tự các quy tắc trong pipeline lên tên file của một context
    pub fn transform_name(&self, context: &FileContext) -> Result<String> {
        let mut stem = context.original_stem.clone();
        let mut ext = context.original_extension.clone();

        for rule in &self.pipeline {
            match rule.scope() {
                TargetScope::StemOnly => {
                    let transformed = rule.apply(&stem, context)?;
                    stem = transformed.into_owned();
                }
                TargetScope::ExtensionOnly => {
                    if let Some(ref e) = ext {
                        let transformed = rule.apply(e, context)?;
                        ext = Some(transformed.into_owned());
                    }
                }
                TargetScope::FullName => {
                    let full_name = match &ext {
                        Some(e) if !e.is_empty() => format!("{}.{}", stem, e),
                        _ => stem.clone(),
                    };
                    let transformed = rule.apply(&full_name, context)?;
                    let transformed_path = Path::new(transformed.as_ref());
                    stem = transformed_path
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    ext = transformed_path
                        .extension()
                        .map(|e| e.to_string_lossy().into_owned());
                }
            }
        }

        let final_name = match ext {
            Some(e) if !e.is_empty() => format!("{}.{}", stem, e),
            _ => stem,
        };

        Ok(final_name)
    }

    /// Tạo bản đồ xem trước (Preview Mode) đa luồng an toàn bằng `rayon::par_iter`.
    /// Tối ưu hóa cho hàng chục ngàn file cùng lúc:
    /// - Không ghi đĩa trong quá trình preview.
    /// - Tính toán tên mới hoàn toàn trên RAM song song trên tất cả các core CPU.
    /// - Tự động phát hiện và giải quyết xung đột tên (Collision Detection) qua TransactionManager.
    pub fn generate_preview(&self, file_paths: &[PathBuf]) -> Result<Vec<RenameItem>> {
        let total = file_paths.len();

        // 1. Áp dụng pipeline song song trên RAM qua Rayon
        let mut items: Vec<RenameItem> = file_paths
            .par_iter()
            .enumerate()
            .map(|(index, path)| {
                let context = FileContext::new(path.clone(), index, total);
                let orig_name = context.original_name.clone();

                match self.transform_name(&context) {
                    Ok(new_name) => {
                        let parent = path.parent().unwrap_or_else(|| Path::new(""));
                        let target_path = parent.join(&new_name);
                        let status = match new_name == orig_name {
                            true => RenameStatus::Unchanged,
                            false => RenameStatus::Pending,
                        };

                        RenameItem {
                            original_path: path.clone(),
                            original_name: orig_name,
                            new_name,
                            target_path,
                            status,
                            has_collision: false,
                        }
                    }
                    Err(err) => RenameItem {
                        original_path: path.clone(),
                        original_name: orig_name.clone(),
                        new_name: orig_name,
                        target_path: path.clone(),
                        status: RenameStatus::Failed(err.to_string()),
                        has_collision: false,
                    },
                }
            })
            .collect();

        // 2. Chạy giải quyết xung đột tên (Collision Detection)
        TransactionManager::resolve_collisions(&mut items)?;

        Ok(items)
    }

    /// Kết nối với `TransactionManager` để thực hiện lệnh đổi tên thực tế (`std::fs::rename`)
    /// lên filesystem với cơ chế an toàn và rollback tự động nếu phát sinh lỗi.
    pub fn commit(&self, items: &mut [RenameItem], manager: &mut TransactionManager) -> Result<()> {
        manager.commit(items)
    }

    /// Tiện ích commit nhanh: Khởi tạo một phiên giao dịch mới, thực thi và trả về TransactionManager
    pub fn commit_batch(&self, items: &mut [RenameItem]) -> Result<TransactionManager> {
        let mut manager = TransactionManager::new();
        manager.commit(items)?;
        Ok(manager)
    }
}
