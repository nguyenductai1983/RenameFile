use crate::core::context::TargetScope;
use crate::core::engine::{RenameItem, RenameStatus, RenamerEngine};
use crate::core::rule::RenameRule;
use crate::core::rules::{
    CaseRule, CaseType, ChangeExtensionRule, FindReplaceRule, NumberingPosition, NumberingRule,
    PrefixSuffixRule, SmartTruncatePathRule, SpaceAction, SpaceRule,
};
use crate::core::scanner::scan_directory_with_progress;
use crate::core::transaction::TransactionManager;
use crate::rules::vietnamese_clean::{
    CleanWhitespaceRule, RemoveVietnameseDiacriticsRule, SanitizeFilenameRule, SlugSeparator,
    WebSafeSlugRule,
};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;
use uuid::Uuid;

/// Trạng thái dùng chung quản lý phiên đổi tên (Tauri Managed State)
pub struct AppState {
    pub transaction_manager: Mutex<TransactionManager>,
    pub cancel_scan: AtomicBool,
}

/// Dữ liệu gửi về Frontend khi đang quét thư mục
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgressPayload {
    pub count: usize,
    pub current_dir: String,
    pub dir_count: usize,
    pub skipped_count: usize,
    pub last_skipped: Option<String>,
}

/// Lệnh cho phép Frontend hủy ngang quá trình quét thư mục lớn
#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.cancel_scan.store(true, Ordering::SeqCst);
}

/// Đại diện cho một file trong danh sách hiển thị trên giao diện React
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub id: String,
    pub path: String,
    pub old_name: String,
    pub new_name: String,
    pub status: String,
    #[serde(default)]
    pub full_path_len: usize,
    #[serde(default)]
    pub is_long_path: bool,
}

/// Kiểu dữ liệu đồng bộ với giao diện cho chức năng xuất báo cáo CSV
pub type PreviewData = FileItem;

/// Cấu hình quy tắc đổi tên truyền từ giao diện Frontend dưới dạng JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleConfig {
    RemoveVietnamese {
        scope: Option<TargetScope>,
    },
    WebSafeSlug {
        separator: Option<String>,
        scope: Option<TargetScope>,
    },
    CleanWhitespace {
        scope: Option<TargetScope>,
    },
    Sanitize {
        replacement: Option<String>,
        scope: Option<TargetScope>,
    },
    Space {
        action: SpaceAction,
        scope: Option<TargetScope>,
    },
    ChangeExtension {
        new_extension: String,
    },
    FindReplace {
        find: String,
        replace: String,
        use_regex: Option<bool>,
        match_case: Option<bool>,
        scope: Option<TargetScope>,
    },
    PrefixSuffix {
        prefix: String,
        suffix: String,
        scope: Option<TargetScope>,
    },
    Numbering {
        start: Option<usize>,
        step: Option<usize>,
        padding: Option<usize>,
        position: Option<NumberingPosition>,
        custom_text: Option<String>,
        scope: Option<TargetScope>,
    },
    Case {
        case_type: CaseType,
        scope: Option<TargetScope>,
    },
    TruncateLongPath {
        max_length: Option<usize>,
        use_middle: Option<bool>,
    },
}

impl RuleConfig {
    /// Chuyển đổi cấu hình JSON thành đối tượng thực thi `Box<dyn RenameRule>`
    pub fn into_rule(self) -> Box<dyn RenameRule> {
        match self {
            RuleConfig::RemoveVietnamese { scope } => Box::new(RemoveVietnameseDiacriticsRule {
                scope: scope.unwrap_or(TargetScope::StemOnly),
            }),
            RuleConfig::WebSafeSlug { separator, scope } => {
                let sep = match separator.as_deref() {
                    Some("_") => SlugSeparator::Underscore,
                    _ => SlugSeparator::Hyphen,
                };
                Box::new(WebSafeSlugRule {
                    separator: sep,
                    scope: scope.unwrap_or(TargetScope::StemOnly),
                })
            }
            RuleConfig::CleanWhitespace { scope } => Box::new(CleanWhitespaceRule {
                scope: scope.unwrap_or(TargetScope::StemOnly),
            }),
            RuleConfig::Sanitize { replacement, scope } => Box::new(SanitizeFilenameRule {
                replacement: replacement.unwrap_or_default(),
                scope: scope.unwrap_or(TargetScope::FullName),
            }),
            RuleConfig::Space { action, scope } => Box::new(SpaceRule {
                action,
                scope: scope.unwrap_or(TargetScope::StemOnly),
            }),
            RuleConfig::ChangeExtension { new_extension } => Box::new(ChangeExtensionRule {
                new_extension,
            }),
            RuleConfig::FindReplace {
                find,
                replace,
                use_regex,
                match_case,
                scope,
            } => Box::new(FindReplaceRule::new(
                find,
                replace,
                use_regex.unwrap_or(false),
                match_case.unwrap_or(false),
                scope.unwrap_or(TargetScope::StemOnly),
            )),
            RuleConfig::PrefixSuffix {
                prefix,
                suffix,
                scope,
            } => Box::new(PrefixSuffixRule::new(
                prefix,
                suffix,
                scope.unwrap_or(TargetScope::StemOnly),
            )),
            RuleConfig::Numbering {
                start,
                step,
                padding,
                position,
                custom_text,
                scope,
            } => Box::new(NumberingRule::new(
                start.unwrap_or(1),
                step.unwrap_or(1),
                padding.unwrap_or(3),
                position.unwrap_or(NumberingPosition::Suffix),
                custom_text.unwrap_or_else(|| "_".to_string()),
                scope.unwrap_or(TargetScope::StemOnly),
            )),
            RuleConfig::Case { case_type, scope } => Box::new(CaseRule::new(
                case_type,
                scope.unwrap_or(TargetScope::StemOnly),
            )),
            RuleConfig::TruncateLongPath { max_length, use_middle } => {
                Box::new(SmartTruncatePathRule::new(
                    max_length.unwrap_or(250),
                    use_middle.unwrap_or(true),
                ))
            }
        }
    }
}

/// Mở hộp thoại chọn nhiều file native (Cross-platform Dialog)
#[tauri::command]
pub async fn select_files() -> Result<Vec<String>, String> {
    let files = rfd::FileDialog::new()
        .set_title("Chọn các tập tin cần đổi tên")
        .pick_files();

    match files {
        Some(paths) => Ok(paths
            .into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect()),
        None => Ok(Vec::new()),
    }
}

/// Mở hộp thoại chọn thư mục và trả về đường dẫn thư mục được chọn
#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Chọn thư mục cần quét tệp tin")
        .pick_folder();

    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

/// Quét danh sách tệp trong thư mục đã chọn (hỗ trợ đệ quy, file ẩn, thư mục con, streaming progress và hủy quét)
#[tauri::command]
pub async fn scan_selected_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    folder_path: String,
    recursive: bool,
    include_hidden: Option<bool>,
    include_folders: Option<bool>,
) -> Result<Vec<String>, String> {
    state.cancel_scan.store(false, Ordering::SeqCst);

    let target_dir = if folder_path.trim().is_empty() {
        let picked = rfd::FileDialog::new()
            .set_title("Chọn thư mục cần quét")
            .pick_folder();
        match picked {
            Some(p) => p,
            None => return Ok(Vec::new()),
        }
    } else {
        PathBuf::from(&folder_path)
    };

    let base_path = if target_dir.is_relative() {
        std::env::current_dir()
            .map(|cwd| cwd.join(&target_dir))
            .unwrap_or(target_dir)
    } else {
        target_dir
    };

    let app_clone = app.clone();
    let cancel_flag = &state.cancel_scan;

    let paths = scan_directory_with_progress(
        &base_path,
        recursive,
        None,
        include_hidden.unwrap_or(false),
        include_folders.unwrap_or(false),
        Some(cancel_flag),
        |count, path, dir_count, skipped_count, last_skipped| {
            let _ = app_clone.emit(
                "scan-progress",
                ScanProgressPayload {
                    count,
                    current_dir: path.to_string_lossy().into_owned(),
                    dir_count,
                    skipped_count,
                    last_skipped: last_skipped.map(|s| s.to_string()),
                },
            );
        },
    )
    .map_err(|e| format!("Lỗi quét thư mục: {:#}", e))?;

    // Báo cáo số lượng hoàn tất lần cuối
    let _ = app.emit(
        "scan-progress",
        ScanProgressPayload {
            count: paths.len(),
            current_dir: "Hoàn tất quét".to_string(),
            dir_count: 0,
            skipped_count: 0,
            last_skipped: None,
        },
    );

    let result_strings: Vec<String> = paths
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    Ok(result_strings)
}

/// Tính toán xem trước (Real-time Preview) trên RAM đa luồng bằng Core Engine
#[tauri::command]
pub async fn preview_renaming(
    files: Vec<String>,
    rules: Vec<RuleConfig>,
) -> Result<Vec<FileItem>, String> {
    let path_bufs: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();

    // Xây dựng Pipeline từ danh sách rule JSON nhận từ frontend
    let pipeline: Vec<Box<dyn RenameRule>> = rules.into_iter().map(RuleConfig::into_rule).collect();
    let engine = RenamerEngine::with_pipeline(pipeline);

    // Chạy Preview tính toán đa luồng song song bằng Rayon
    let preview_items = engine
        .generate_preview(&path_bufs)
        .map_err(|e| format!("Lỗi tính toán xem trước: {:#}", e))?;

    // Chuyển đổi sang FileItem trả về cho React Frontend
    let file_items: Vec<FileItem> = preview_items
        .into_iter()
        .map(|item| {
            let status_str = match item.status {
                RenameStatus::Pending => "pending",
                RenameStatus::Renamed => "renamed",
                RenameStatus::Unchanged => "unchanged",
                RenameStatus::CollisionResolved => "collision_resolved",
                RenameStatus::Failed(ref msg) => msg.as_str(),
            };

            let parent = item.original_path.parent().unwrap_or_else(|| Path::new(""));
            let full_path_len = parent.to_string_lossy().len() + 1 + item.new_name.len();
            let is_long_path = full_path_len >= 250;

            FileItem {
                id: Uuid::new_v4().to_string(),
                path: item.original_path.to_string_lossy().into_owned(),
                old_name: item.original_name,
                new_name: item.new_name,
                status: status_str.to_string(),
                full_path_len,
                is_long_path,
            }
        })
        .collect();

    Ok(file_items)
}

/// Thực thi lệnh đổi tên thực tế trên đĩa cứng qua TransactionManager với auto-rollback nếu lỗi
#[tauri::command]
pub async fn apply_renaming(
    state: tauri::State<'_, AppState>,
    items: Vec<FileItem>,
) -> Result<Vec<FileItem>, String> {
    let mut rename_items: Vec<RenameItem> = items
        .iter()
        .map(|fi| {
            let orig_path = PathBuf::from(&fi.path);
            let parent = orig_path.parent().unwrap_or_else(|| Path::new(""));
            let target_path = parent.join(&fi.new_name);

            RenameItem {
                original_path: orig_path,
                original_name: fi.old_name.clone(),
                new_name: fi.new_name.clone(),
                target_path,
                status: if fi.old_name == fi.new_name {
                    RenameStatus::Unchanged
                } else {
                    RenameStatus::Pending
                },
                has_collision: false,
            }
        })
        .collect();

    let mut manager = state
        .transaction_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    manager
        .commit(&mut rename_items)
        .map_err(|e| format!("Lỗi đổi tên: {:#}", e))?;

    let updated_items: Vec<FileItem> = items
        .into_iter()
        .zip(rename_items.into_iter())
        .map(|(orig_fi, ri)| {
            let status_str = match ri.status {
                RenameStatus::Renamed => "renamed",
                RenameStatus::Unchanged => "unchanged",
                RenameStatus::CollisionResolved => "collision_resolved",
                RenameStatus::Failed(ref msg) => msg.as_str(),
                RenameStatus::Pending => "pending",
            };

            let final_path = if ri.status == RenameStatus::Renamed {
                ri.target_path.to_string_lossy().into_owned()
            } else {
                orig_fi.path
            };

            let full_path_len = final_path.len();
            let is_long_path = full_path_len >= 250;

            FileItem {
                id: orig_fi.id,
                path: final_path,
                old_name: orig_fi.old_name, // Tuyệt đối giữ nguyên tên ban đầu để đối chiếu
                new_name: ri.new_name,
                status: status_str.to_string(),
                full_path_len,
                is_long_path,
            }
        })
        .collect();

    Ok(updated_items)
}

/// Hoàn tác (Rollback / Undo) phiên đổi tên gần nhất
#[tauri::command]
pub async fn rollback_renaming(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let mut manager = state
        .transaction_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let reverted = manager
        .rollback()
        .map_err(|e| format!("Lỗi hoàn tác: {:#}", e))?;

    Ok(reverted.len())
}

/// Xuất danh sách tập tin và trạng thái đổi tên ra tệp tin CSV (hỗ trợ hiển thị đúng tiếng Việt trên Excel)
#[tauri::command]
pub async fn export_to_csv(export_path: String, data: Vec<PreviewData>) -> Result<(), String> {
    let target_path = if export_path.trim().is_empty() {
        let picked = rfd::FileDialog::new()
            .set_title("Lưu báo cáo đổi tên dạng CSV")
            .add_filter("CSV Files (*.csv)", &["csv"])
            .set_file_name("danh_sach_doi_ten.csv")
            .save_file();
        match picked {
            Some(p) => p,
            None => return Ok(()),
        }
    } else {
        PathBuf::from(export_path.trim())
    };

    let file = File::create(&target_path)
        .map_err(|e| format!("Không thể tạo tệp CSV tại {}: {:#}", target_path.display(), e))?;

    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(file);

    // Ghi UTF-8 BOM để Excel hiển thị đúng dấu tiếng Việt không bị lỗi font (mojibake)
    let _ = writer.get_ref().write_all("\u{FEFF}".as_bytes());

    // Tiêu đề cột
    writer
        .write_record(["ID", "Đường dẫn gốc", "Tên ban đầu", "Tên mới dự kiến", "Trạng thái"])
        .map_err(|e| format!("Lỗi ghi tiêu đề CSV: {:#}", e))?;

    for item in &data {
        writer
            .write_record([
                &item.id,
                &item.path,
                &item.old_name,
                &item.new_name,
                &item.status,
            ])
            .map_err(|e| format!("Lỗi ghi dữ liệu CSV: {:#}", e))?;
    }

    writer
        .flush()
        .map_err(|e| format!("Lỗi lưu tệp CSV: {:#}", e))?;

    Ok(())
}

/// Mở thư mục hoặc định vị tệp tin trong trình quản lý file của hệ điều hành
#[tauri::command]
pub async fn open_folder_in_os(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(folder_path.trim());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        // 1. Nếu path tồn tại và là file: dùng raw_arg để truyền chính xác /select,"path" vào explorer
        if path.is_file() {
            let mut cmd = std::process::Command::new("explorer");
            cmd.raw_arg(format!("/select,\"{}\"", path.display()));
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        }

        // 2. Nếu path là thư mục tồn tại: mở trực tiếp thư mục đó
        if path.is_dir() {
            let mut cmd = std::process::Command::new("explorer");
            cmd.arg(&path);
            cmd.spawn()
                .map_err(|e| format!("Không thể mở Windows Explorer: {:#}", e))?;
            return Ok(());
        }

        // 3. Nếu file không tồn tại (vd: đang xem trước xung đột): tìm và mở THƯ MỤC CHỨA FILE
        if let Some(parent) = path.parent() {
            if parent.exists() {
                let mut cmd = std::process::Command::new("explorer");
                cmd.arg(parent);
                cmd.spawn()
                    .map_err(|e| format!("Không thể mở thư mục chứa file: {:#}", e))?;
                return Ok(());
            }
        }

        Err(format!("Đường dẫn hoặc thư mục chứa không tồn tại: {}", path.display()))
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        if path.is_file() {
            cmd.arg("-R").arg(&path);
        } else if path.is_dir() {
            cmd.arg(&path);
        } else if let Some(parent) = path.parent() {
            cmd.arg(parent);
        } else {
            cmd.arg(&path);
        }
        cmd.spawn()
            .map_err(|e| format!("Không thể mở Finder: {:#}", e))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let target = if path.is_file() {
            path.parent().unwrap_or(&path)
        } else if path.is_dir() {
            &path
        } else if let Some(parent) = path.parent() {
            parent
        } else {
            &path
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Không thể mở trình duyệt tập tin: {:#}", e))?;
        Ok(())
    }
}

/// Lấy thông tin kích thước và dung lượng của các tệp ảnh được chọn (siêu nhanh)
#[tauri::command]
pub fn inspect_image_files(files: Vec<String>) -> Vec<crate::core::ImageItem> {
    crate::core::inspect_images(files)
}

/// Thực thi giảm kích thước và ghi đè an toàn (Atomic Overwrite) lên các tệp ảnh đã chọn
#[tauri::command]
pub fn batch_resize_and_overwrite_images(
    app: tauri::AppHandle,
    files: Vec<String>,
    config: crate::core::ResizeConfig,
) -> crate::core::BatchResizeSummary {
    crate::core::resize_images_batch_with_progress(files, config, Some(&app))
}

