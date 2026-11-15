use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Chiến lược giải quyết khi xảy ra trùng lặp tên file (Collision Strategy)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CollisionStrategy {
    /// Báo lỗi và dừng/hủy bỏ item bị trùng
    Fail,
    /// Bỏ qua không đổi tên các file bị trùng
    Skip,
    /// Tự động thêm hậu tố số tăng dần (ví dụ: "document_1.pdf", "document_2.pdf")
    /// Template sử dụng `{n}` làm placeholder, ví dụ: "_{n}" hoặc " ({n})"
    AutoNumericSuffix {
        template: String,
        start_index: usize,
    },
}

impl Default for CollisionStrategy {
    fn default() -> Self {
        Self::AutoNumericSuffix {
            template: "_{n}".to_string(),
            start_index: 1,
        }
    }
}

pub struct CollisionResolver;

impl CollisionResolver {
    /// Giải quyết xung đột tên file trong danh sách ánh xạ dự kiến (Preview Batch)
    /// và kiểm tra sự tồn tại trên ổ đĩa.
    pub fn resolve<T, FGetPath, FGetNewName, FSetNewName>(
        items: &mut [T],
        strategy: &CollisionStrategy,
        mut get_original_path: FGetPath,
        mut get_new_name: FGetNewName,
        mut set_new_name: FSetNewName,
    ) where
        FGetPath: FnMut(&T) -> &Path,
        FGetNewName: FnMut(&T) -> &str,
        FSetNewName: FnMut(&mut T, String),
    {
        let mut target_counts: HashMap<PathBuf, usize> = HashMap::new();
        let mut occupied_paths: HashSet<PathBuf> = HashSet::new();

        for item in items.iter_mut() {
            let orig_path = get_original_path(item).to_path_buf();
            let parent_dir = orig_path.parent().unwrap_or_else(|| Path::new("")).to_path_buf();
            let candidate_name = get_new_name(item).to_string();

            let target_path = parent_dir.join(&candidate_name);

            // Kiểm tra xem target_path đã bị chiếm bởi một item khác trong batch
            // hoặc đã tồn tại trên đĩa (mà không phải chính file này)
            let is_in_batch_conflict = occupied_paths.contains(&target_path);
            let is_on_disk_conflict = target_path.exists() && target_path != orig_path;

            if !is_in_batch_conflict && !is_on_disk_conflict {
                occupied_paths.insert(target_path);
                continue;
            }

            // Xử lý theo chiến lược
            match strategy {
                CollisionStrategy::Fail => {
                    // Để nguyên hoặc đánh dấu, trong engine sẽ check status
                }
                CollisionStrategy::Skip => {
                    // Giữ lại tên gốc
                    if let Some(orig_name) = orig_path.file_name() {
                        let orig_name_str = orig_name.to_string_lossy().into_owned();
                        set_new_name(item, orig_name_str);
                        occupied_paths.insert(orig_path.clone());
                    }
                }
                CollisionStrategy::AutoNumericSuffix { template, start_index } => {
                    let path_obj = Path::new(&candidate_name);
                    let stem = path_obj.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                    let ext = path_obj.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();

                    let count = target_counts.entry(parent_dir.join(&stem)).or_insert(*start_index);

                    let (resolved_path, final_name) = loop {
                        let suffix = template.replace("{n}", &count.to_string());
                        let candidate_final_name = format!("{}{}{}", stem, suffix, ext);
                        let candidate_resolved_path = parent_dir.join(&candidate_final_name);
                        *count += 1;

                        let conflict_batch = occupied_paths.contains(&candidate_resolved_path);
                        let conflict_disk = candidate_resolved_path.exists() && candidate_resolved_path != orig_path;

                        if !conflict_batch && !conflict_disk {
                            break (candidate_resolved_path, candidate_final_name);
                        }
                    };

                    set_new_name(item, final_name);
                    occupied_paths.insert(resolved_path);
                }
            }
        }
    }
}
