use anyhow::{bail, Result};
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

/// Danh sách tên các thư mục hệ thống hoặc build artifact cần bỏ qua khi quét
const IGNORED_DIRECTORIES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".svn",
    ".hg",
    ".vscode",
    ".idea",
    "dist",
    "build",
    "$recycle.bin",
    "system volume information",
    "recovery",
    "$winreagent",
    "config.msi",
    "$windows.~bt",
    "$windows.~ws",
    "windows",
    "msocache",
    ".vs",
    "bin",
    "obj",
];

/// Danh sách tệp tin hệ thống Windows bị khóa hoặc tệp rác cần bỏ qua
const IGNORED_FILES: &[&str] = &[
    "pagefile.sys",
    "hiberfil.sys",
    "dumpstack.log.tmp",
    "swapfile.sys",
];

/// Kiểm tra xem một thư mục có nằm trong danh sách cần bỏ qua hay không.
/// Thư mục gốc (depth == 0) không bao giờ bị bỏ qua.
fn is_ignored_directory(entry: &DirEntry) -> bool {
    if entry.depth() > 0 && entry.file_type().is_dir() {
        if let Some(name) = entry.file_name().to_str() {
            let lower = name.to_lowercase();
            return IGNORED_DIRECTORIES.iter().any(|&ignored| lower == ignored);
        }
    }
    false
}

#[cfg(windows)]
fn is_os_hidden(entry: &DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    if let Ok(metadata) = entry.metadata() {
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        return (metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN) != 0;
    }
    false
}

#[cfg(not(windows))]
fn is_os_hidden(_entry: &DirEntry) -> bool {
    false
}

#[cfg(windows)]
fn is_reparse_point(entry: &DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    if entry.depth() > 0 {
        if let Ok(metadata) = entry.metadata() {
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
            return (metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
        }
    }
    false
}

#[cfg(not(windows))]
fn is_reparse_point(_entry: &DirEntry) -> bool {
    false
}

/// Kiểm tra xem file hoặc thư mục có bị ẩn hay không.
/// Quy ước: Tên bắt đầu bằng dấu chấm '.' hoặc có cờ ẩn từ hệ điều hành.
fn is_hidden_entry(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    if let Some(name) = entry.file_name().to_str() {
        if name.starts_with('.') {
            return true;
        }
    }
    is_os_hidden(entry)
}

/// Quét thư mục và trả về danh sách các tệp tin / thư mục hợp lệ (kèm callback tiến độ, thống kê và cờ hủy).
pub fn scan_directory_with_progress<F>(
    path: &Path,
    recursive: bool,
    ext_filter: Option<&str>,
    include_hidden: bool,
    include_folders: bool,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
    mut progress_callback: F,
) -> Result<Vec<PathBuf>>
where
    F: FnMut(usize, &Path, usize, usize, Option<&str>),
{
    if !path.exists() {
        bail!("Đường dẫn không tồn tại: {}", path.display());
    }

    if !path.is_dir() {
        bail!("Đường dẫn không phải là thư mục: {}", path.display());
    }

    // Chuẩn hóa bộ lọc đuôi file (loại bỏ dấu chấm ở đầu và chuyển thành chữ thường)
    let normalized_ext = ext_filter
        .map(|ext| ext.trim().trim_start_matches('.').to_lowercase())
        .filter(|ext| !ext.is_empty());

    let mut walker = WalkDir::new(path);
    if !recursive {
        // depth 0: thư mục gốc; depth 1: các file/thư mục con trực tiếp
        walker = walker.max_depth(1);
    }

    let mut results = Vec::new();
    let mut last_report = std::time::Instant::now();
    let mut dir_count = 0usize;
    let mut skipped_count = 0usize;
    let mut last_skipped: Option<String> = None;

    // Sử dụng filter_entry để loại bỏ sớm các thư mục không cần thiết, junctions và tệp ẩn
    let entry_filter = |e: &DirEntry| -> bool {
        if is_ignored_directory(e) {
            return false;
        }
        if is_reparse_point(e) {
            return false;
        }
        if !include_hidden && is_hidden_entry(e) {
            return false;
        }
        true
    };

    for entry_res in walker.into_iter().filter_entry(entry_filter) {
        if let Some(flag) = cancel_flag {
            if flag.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
        }

        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                skipped_count += 1;
                last_skipped = Some(e.path().map(|p| p.display().to_string()).unwrap_or_else(|| "Thư mục không thể truy cập".to_string()));
                log_or_skip_scan_error(&e);
                continue;
            }
        };

        // Không bao gồm thư mục gốc (depth == 0) đang được duyệt
        if entry.depth() == 0 {
            continue;
        }

        let is_file = entry.file_type().is_file();
        let is_dir = entry.file_type().is_dir();

        if is_dir {
            dir_count += 1;
        }

        if last_report.elapsed() >= std::time::Duration::from_millis(40) {
            last_report = std::time::Instant::now();
            progress_callback(results.len(), entry.path(), dir_count, skipped_count, last_skipped.as_deref());
        }

        if is_file {
            if let Some(name) = entry.file_name().to_str() {
                let lower = name.to_lowercase();
                if IGNORED_FILES.iter().any(|&f| lower == f) {
                    continue;
                }
            }

            if let Some(ref expected_ext) = normalized_ext {
                let matches_ext = entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case(expected_ext))
                    .unwrap_or(false);

                if !matches_ext {
                    continue;
                }
            }
            results.push(entry.into_path());
        } else if is_dir && include_folders {
            if let Some(ref expected_ext) = normalized_ext {
                let matches_ext = entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case(expected_ext))
                    .unwrap_or(false);

                if !matches_ext {
                    continue;
                }
            }
            results.push(entry.into_path());
        }
    }

    progress_callback(results.len(), path, dir_count, skipped_count, last_skipped.as_deref());
    results.sort();
    Ok(results)
}

/// Quét thư mục và trả về danh sách các tệp tin / thư mục hợp lệ.
pub fn scan_directory(
    path: &Path,
    recursive: bool,
    ext_filter: Option<&str>,
    include_hidden: bool,
    include_folders: bool,
) -> Result<Vec<PathBuf>> {
    scan_directory_with_progress(
        path,
        recursive,
        ext_filter,
        include_hidden,
        include_folders,
        None,
        |_, _, _, _, _| {},
    )
}

fn log_or_skip_scan_error(_err: &walkdir::Error) {
    // Không làm sập ứng dụng khi gặp file/thư mục không có quyền truy cập
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, File};
    use tempfile::tempdir;

    #[test]
    fn test_scan_directory_non_recursive() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("file1.txt"))?;
        File::create(root.join("file2.png"))?;

        let sub = root.join("sub");
        create_dir_all(&sub)?;
        File::create(sub.join("nested.txt"))?;

        let result = scan_directory(root, false, None, false, false)?;
        assert_eq!(result.len(), 2);
        assert!(result.contains(&root.join("file1.txt")));
        assert!(result.contains(&root.join("file2.png")));
        assert!(!result.contains(&sub.join("nested.txt")));

        Ok(())
    }

    #[test]
    fn test_scan_directory_recursive() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("file1.txt"))?;

        let sub = root.join("sub");
        create_dir_all(&sub)?;
        File::create(sub.join("file2.txt"))?;

        let sub2 = sub.join("nested");
        create_dir_all(&sub2)?;
        File::create(sub2.join("file3.txt"))?;

        let result = scan_directory(root, true, None, false, false)?;
        assert_eq!(result.len(), 3);
        assert!(result.contains(&root.join("file1.txt")));
        assert!(result.contains(&sub.join("file2.txt")));
        assert!(result.contains(&sub2.join("file3.txt")));

        Ok(())
    }

    #[test]
    fn test_scan_directory_with_extension_filter() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("photo.PNG"))?;
        File::create(root.join("photo.jpg"))?;
        File::create(root.join("document.txt"))?;

        let pngs = scan_directory(root, false, Some("png"), false, false)?;
        assert_eq!(pngs.len(), 1);
        assert!(pngs.contains(&root.join("photo.PNG")));

        let dots_jpg = scan_directory(root, false, Some(".jpg"), false, false)?;
        assert_eq!(dots_jpg.len(), 1);
        assert!(dots_jpg.contains(&root.join("photo.jpg")));

        Ok(())
    }

    #[test]
    fn test_scan_directory_include_hidden() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("normal.txt"))?;
        File::create(root.join(".hidden.txt"))?;

        // Mặc định không bao gồm file ẩn
        let without_hidden = scan_directory(root, false, None, false, false)?;
        assert_eq!(without_hidden.len(), 1);
        assert_eq!(without_hidden[0], root.join("normal.txt"));

        // Khi bật include_hidden = true
        let with_hidden = scan_directory(root, false, None, true, false)?;
        assert_eq!(with_hidden.len(), 2);
        assert!(with_hidden.contains(&root.join(".hidden.txt")));

        Ok(())
    }

    #[test]
    fn test_scan_directory_include_folders() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("file.txt"))?;
        let sub = root.join("subfolder");
        create_dir_all(&sub)?;

        // include_folders = false -> chỉ có 1 file
        let files_only = scan_directory(root, false, None, false, false)?;
        assert_eq!(files_only.len(), 1);
        assert_eq!(files_only[0], root.join("file.txt"));

        // include_folders = true -> có cả file và thư mục
        let files_and_dirs = scan_directory(root, false, None, false, true)?;
        assert_eq!(files_and_dirs.len(), 2);
        assert!(files_and_dirs.contains(&sub));
        assert!(files_and_dirs.contains(&root.join("file.txt")));

        Ok(())
    }

    #[test]
    fn test_scan_directory_ignores_git_and_node_modules() -> Result<()> {
        let dir = tempdir()?;
        let root = dir.path();

        File::create(root.join("app.rs"))?;

        let git = root.join(".git");
        create_dir_all(&git)?;
        File::create(git.join("config"))?;

        let node = root.join("node_modules").join("package");
        create_dir_all(&node)?;
        File::create(node.join("index.js"))?;

        let result = scan_directory(root, true, None, true, false)?;
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], root.join("app.rs"));

        Ok(())
    }

    #[test]
    fn test_scan_non_existent_path() {
        let path = Path::new("non_existent_folder_abc_123");
        assert!(scan_directory(path, true, None, false, false).is_err());
    }
}
