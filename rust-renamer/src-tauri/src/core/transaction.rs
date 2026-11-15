use crate::core::engine::{RenameItem, RenameStatus};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Bản ghi lưu trữ một thao tác đổi tên đã thực hiện thành công
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenameRecord {
    pub original_path: PathBuf,
    pub new_path: PathBuf,
}

// Giữ lại alias RenameOperation để tương thích ngược
pub type RenameOperation = RenameRecord;

/// Quản lý giao dịch đổi tên file, đảm bảo tính an toàn (Safety),
/// xử lý xung đột tên (Collision Detection) và hỗ trợ hoàn tác toàn diện (Rollback/Undo).
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TransactionManager {
    /// Lịch sử các file đã được đổi tên thành công trong phiên (dùng cho Undo)
    history: Vec<RenameRecord>,
}

impl TransactionManager {
    /// Khởi tạo một TransactionManager mới
    pub fn new() -> Self {
        Self {
            history: Vec::new(),
        }
    }

    /// Lấy danh sách lịch sử các thao tác đổi tên đã ghi nhận
    pub fn history(&self) -> &[RenameRecord] {
        &self.history
    }

    /// Số lượng file đã đổi tên thành công trong phiên hiện tại
    pub fn len(&self) -> usize {
        self.history.len()
    }

    /// Kiểm tra xem phiên giao dịch có trống hay không
    pub fn is_empty(&self) -> bool {
        self.history.is_empty()
    }

    /// Ghi nhận thủ công một thao tác đổi tên vào nhật ký giao dịch
    pub fn record(&mut self, original_path: PathBuf, new_path: PathBuf) {
        self.history.push(RenameRecord {
            original_path,
            new_path,
        });
    }

    /// Kiểm tra xem 2 đường dẫn có đại diện cho cùng 1 file hay không
    /// (Hỗ trợ xử lý trường hợp đổi hoa/thường trên Windows NTFS không phân biệt hoa thường)
    fn is_same_file(path_a: &Path, path_b: &Path) -> bool {
        if path_a == path_b {
            return true;
        }
        #[cfg(windows)]
        {
            path_a
                .to_string_lossy()
                .eq_ignore_ascii_case(&path_b.to_string_lossy())
        }
        #[cfg(not(windows))]
        {
            false
        }
    }

    /// Phát hiện và giải quyết xung đột tên (Collision Detection):
    /// Kiểm tra xem tên mới có bị trùng với file đã có trên ổ đĩa
    /// hoặc trùng với một file khác trong cùng lô hay không.
    /// Nếu trùng, tự động sinh hậu tố `_1`, `_2`, ... cho đến khi tìm được tên duy nhất.
    pub fn resolve_collisions(items: &mut [RenameItem]) -> Result<()> {
        let total = items.len();
        // Tối ưu hóa hiệu năng cực đại: Nếu danh sách lớn (> 2000 tệp), giải quyết xung đột thuần trên RAM
        // để tránh hàng trăm nghìn lần gọi syscall disk stat làm nghẽn đĩa cứng kéo dài hàng chục giây.
        let check_disk = total <= 2000;
        let mut occupied_paths: HashSet<PathBuf> = HashSet::with_capacity(total);

        items.iter_mut().for_each(|item| {
            let parent_dir = item
                .original_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_default();

            let target_path = parent_dir.join(&item.new_name);

            // Kiểm tra xung đột: trùng với file khác trong lô hoặc đã tồn tại trên đĩa (khác file gốc)
            let is_batch_conflict = occupied_paths.contains(&target_path);
            let is_disk_conflict = check_disk && target_path.exists() && !Self::is_same_file(&target_path, &item.original_path);

            match is_batch_conflict || is_disk_conflict {
                false => {
                    // Không có xung đột, bảo lưu target_path
                    item.target_path = target_path.clone();
                    occupied_paths.insert(target_path);
                }
                true => {
                    // Xảy ra xung đột: Tách stem và extension để tạo hậu tố _1, _2...
                    item.has_collision = true;
                    item.status = RenameStatus::CollisionResolved;

                    let target_path_obj = Path::new(&item.new_name);
                    let stem = target_path_obj
                        .file_stem()
                        .map(|s| s.to_string_lossy())
                        .unwrap_or_default();
                    let ext = target_path_obj
                        .extension()
                        .map(|e| format!(".{}", e.to_string_lossy()))
                        .unwrap_or_default();

                    let mut counter: usize = 1;
                    loop {
                        let candidate_name = format!("{}_{}{}", stem, counter, ext);
                        let candidate_path = parent_dir.join(&candidate_name);

                        let candidate_batch_conflict = occupied_paths.contains(&candidate_path);
                        let candidate_disk_conflict = check_disk && candidate_path.exists()
                            && !Self::is_same_file(&candidate_path, &item.original_path);

                        match candidate_batch_conflict || candidate_disk_conflict {
                            false => {
                                item.new_name = candidate_name;
                                item.target_path = candidate_path.clone();
                                occupied_paths.insert(candidate_path);
                                break;
                            }
                            true => {
                                counter += 1;
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    /// Đổi tên một file đơn lẻ và ghi nhận vào lịch sử giao dịch
    pub fn execute_rename(&mut self, from: &Path, to: &Path) -> Result<()> {
        Self::perform_fs_rename(from, to)?;
        self.record(from.to_path_buf(), to.to_path_buf());
        Ok(())
    }

    /// Chuyển đổi đường dẫn sang dạng Extended-Length Path `\\?\` trên Windows nếu đường dẫn dài
    fn to_extended_path(p: &Path) -> PathBuf {
        #[cfg(windows)]
        {
            let s = p.to_string_lossy();
            if !s.starts_with(r"\\?\") && s.len() >= 240 {
                if s.chars().nth(1) == Some(':') {
                    // Chuẩn hóa đường dẫn ổ đĩa tuyệt đối sang Extended Path để vượt qua giới hạn MAX_PATH 260 ký tự
                    return PathBuf::from(format!(r"\\?\{}", s.replace('/', "\\")));
                }
            }
        }
        p.to_path_buf()
    }

    /// Thực hiện đổi tên cấp filesystem, hỗ trợ trường hợp đổi case trên Windows qua file tạm
    fn perform_fs_rename(from: &Path, to: &Path) -> Result<()> {
        let actual_from = Self::to_extended_path(from);
        let actual_to = Self::to_extended_path(to);

        #[cfg(windows)]
        {
            if from != to && Self::is_same_file(from, to) {
                // Trên Windows NTFS đổi case cùng file (e.g. test.txt -> TEST.TXT) cần trung gian
                let temp_name = format!("{}.__tmp_agy_{}", actual_from.to_string_lossy(), std::process::id());
                let temp_path = PathBuf::from(&temp_name);
                fs::rename(&actual_from, &temp_path).with_context(|| {
                    format!("Failed intermediate step renaming '{:?}' -> '{:?}'", actual_from, temp_path)
                })?;
                return fs::rename(&temp_path, &actual_to).with_context(|| {
                    format!("Failed final step renaming '{:?}' -> '{:?}'", temp_path, actual_to)
                });
            }
        }

        fs::rename(&actual_from, &actual_to).with_context(|| {
            format!("Failed to rename file from '{:?}' to '{:?}'", actual_from, actual_to)
        })
    }

    /// Thực thi toàn bộ danh sách `RenameItem` lên filesystem.
    /// Nếu có bất kỳ lỗi nào xảy ra giữa chừng, hàm sẽ TỰ ĐỘNG ROLLBACK
    /// toàn bộ các file đã đổi tên trước đó về trạng thái ban đầu để tránh sai hỏng dữ liệu.
    pub fn commit(&mut self, items: &mut [RenameItem]) -> Result<()> {
        for item in items.iter_mut() {
            // Bỏ qua các file không thay đổi tên hoặc đã bị đánh dấu lỗi
            match item.status {
                RenameStatus::Unchanged | RenameStatus::Failed(_) => continue,
                _ => {}
            }

            if item.original_path == item.target_path {
                item.status = RenameStatus::Unchanged;
                continue;
            }

            match Self::perform_fs_rename(&item.original_path, &item.target_path) {
                Ok(_) => {
                    item.status = RenameStatus::Renamed;
                    self.record(item.original_path.clone(), item.target_path.clone());
                }
                Err(err) => {
                    let err_msg = format!(
                        "Rename error for '{:?}' -> '{:?}': {}. Triggering automatic rollback.",
                        item.original_path, item.target_path, err
                    );
                    item.status = RenameStatus::Failed(err.to_string());

                    // Tự động rollback các file đã thành công trước đó
                    let rollback_res = self.rollback();
                    match rollback_res {
                        Ok(_) => {
                            return Err(anyhow::anyhow!(
                                "{}\nRollback executed successfully. All files restored.",
                                err_msg
                            ));
                        }
                        Err(rollback_err) => {
                            return Err(anyhow::anyhow!(
                                "{}\nCRITICAL: Rollback failed partially: {}",
                                err_msg,
                                rollback_err
                            ));
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Hoàn tác toàn bộ các thao tác đổi tên theo cơ chế LIFO (Last-In, First-Out).
    /// Khôi phục tên ban đầu cho mọi file đã đổi tên thành công.
    pub fn rollback(&mut self) -> Result<Vec<RenameRecord>> {
        let mut reverted = Vec::with_capacity(self.history.len());
        let mut errors = Vec::new();

        // Lấy ngược từ cuối lên đầu để đảm bảo tính an toàn thứ tự
        while let Some(record) = self.history.pop() {
            match record.new_path.exists() {
                true => match Self::perform_fs_rename(&record.new_path, &record.original_path) {
                    Ok(_) => reverted.push(record),
                    Err(e) => errors.push(format!(
                        "Cannot restore '{:?}' to '{:?}': {}",
                        record.new_path, record.original_path, e
                    )),
                },
                false => errors.push(format!(
                    "Cannot restore '{:?}': target file missing on disk",
                    record.new_path
                )),
            }
        }

        match errors.is_empty() {
            true => Ok(reverted),
            false => Err(anyhow::anyhow!(
                "Rollback encountered errors:\n{}",
                errors.join("\n")
            )),
        }
    }
}
