use image::{imageops::FilterType, DynamicImage, GenericImageView, ImageFormat};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageItem {
    pub path: String,
    pub file_name: String,
    pub width: u32,
    pub height: u32,
    pub file_size: u64,
    pub format: String,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizeConfig {
    pub max_width: u32,
    pub max_height: u32,
    pub preserve_aspect_ratio: bool,
    pub quality: u8, // 10 - 100
    pub format_mode: String, // "original" | "webp" | "jpeg" | "png"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizeProgressPayload {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizeResultItem {
    pub path: String,
    pub original_size: u64,
    pub new_size: u64,
    pub original_width: u32,
    pub original_height: u32,
    pub new_width: u32,
    pub new_height: u32,
    pub success: bool,
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResizeSummary {
    pub total: usize,
    pub succeeded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub original_size_total: u64,
    pub new_size_total: u64,
    pub saved_bytes: i64,
    pub items: Vec<ResizeResultItem>,
}

pub fn is_supported_image(path: &Path) -> bool {
    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e.to_lowercase(),
        None => return false,
    };
    matches!(
        ext.as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "bmp"
    )
}

/// Lấy thông tin kích thước và dung lượng tệp tin siêu nhanh bằng cách đọc header (không nạp toàn bộ pixel)
pub fn inspect_images(paths: Vec<String>) -> Vec<ImageItem> {
    paths
        .into_par_iter()
        .filter_map(|p_str| {
            let path = Path::new(&p_str);
            if !is_supported_image(path) {
                return None;
            }

            let file_name = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();

            let metadata = fs::metadata(path).ok()?;
            let file_size = metadata.len();

            let format = path
                .extension()
                .map(|e| e.to_string_lossy().to_uppercase())
                .unwrap_or_else(|| "UNKNOWN".to_string());

            match image::image_dimensions(path) {
                Ok((w, h)) => Some(ImageItem {
                    path: p_str,
                    file_name,
                    width: w,
                    height: h,
                    file_size,
                    format,
                    is_valid: true,
                }),
                Err(_) => Some(ImageItem {
                    path: p_str,
                    file_name,
                    width: 0,
                    height: 0,
                    file_size,
                    format,
                    is_valid: false,
                }),
            }
        })
        .collect()
}

/// Tính toán kích thước mới dựa trên max_width & max_height và aspect ratio
fn calculate_new_dimensions(
    orig_w: u32,
    orig_h: u32,
    max_w: u32,
    max_h: u32,
    preserve_aspect: bool,
) -> (u32, u32) {
    if orig_w == 0 || orig_h == 0 {
        return (orig_w, orig_h);
    }

    if !preserve_aspect {
        let w = if max_w > 0 { max_w } else { orig_w };
        let h = if max_h > 0 { max_h } else { orig_h };
        return (w, h);
    }

    // Nếu ảnh nhỏ hơn cả max_w và max_h thì giữ nguyên không phóng to
    if (max_w == 0 || orig_w <= max_w) && (max_h == 0 || orig_h <= max_h) {
        return (orig_w, orig_h);
    }

    let ratio_w = if max_w > 0 {
        max_w as f64 / orig_w as f64
    } else {
        1.0
    };
    let ratio_h = if max_h > 0 {
        max_h as f64 / orig_h as f64
    } else {
        1.0
    };

    let scale = ratio_w.min(ratio_h);
    let new_w = ((orig_w as f64) * scale).round().max(1.0) as u32;
    let new_h = ((orig_h as f64) * scale).round().max(1.0) as u32;

    (new_w, new_h)
}

/// Nén và ghi đè an toàn (Atomic Overwrite) lên một tệp tin ảnh
pub fn resize_and_overwrite_single(
    path_str: &str,
    config: &ResizeConfig,
) -> Result<ResizeResultItem, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("File không tồn tại: {}", path_str));
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let original_size = metadata.len();

    // 1. Mở và giải mã ảnh
    let img = image::open(path).map_err(|e| format!("Không thể đọc ảnh: {}", e))?;
    let (orig_w, orig_h) = img.dimensions();

    // 2. KIỂM TRA BẢO VỆ KÍCH THƯỚC:
    // Nếu kích thước ban đầu của ảnh đã nhỏ hơn hoặc bằng kích thước mới yêu cầu,
    // thì KHÔNG thực hiện thay đổi, bỏ qua để tránh làm kích thước ảnh lớn hơn hoặc suy giảm chất lượng!
    let is_already_smaller_resolution = (config.max_width > 0 || config.max_height > 0)
        && (config.max_width == 0 || orig_w <= config.max_width)
        && (config.max_height == 0 || orig_h <= config.max_height);

    if is_already_smaller_resolution && config.format_mode == "original" {
        return Ok(ResizeResultItem {
            path: path_str.to_string(),
            original_size,
            new_size: original_size,
            original_width: orig_w,
            original_height: orig_h,
            new_width: orig_w,
            new_height: orig_h,
            success: true,
            skipped: true,
            skip_reason: Some("Kích thước ban đầu đã nhỏ hơn kích thước được chọn, đã tự động giữ nguyên".to_string()),
            error_message: None,
        });
    }

    // 3. Tính toán kích thước mới
    let (target_w, target_h) = calculate_new_dimensions(
        orig_w,
        orig_h,
        config.max_width,
        config.max_height,
        config.preserve_aspect_ratio,
    );

    // 3. Thực hiện Resize bằng Lanczos3 (thuật toán chất lượng cao, giữ chi tiết)
    let processed_img: DynamicImage = if target_w != orig_w || target_h != orig_h {
        img.resize_exact(target_w, target_h, FilterType::Lanczos3)
    } else {
        img
    };

    // 4. Xác định định dạng tệp và phần mở rộng
    let ext_lower = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "jpg".to_string());

    let (format, output_ext) = match config.format_mode.as_str() {
        "webp" => (ImageFormat::WebP, "webp"),
        "jpeg" | "jpg" => (ImageFormat::Jpeg, "jpg"),
        "png" => (ImageFormat::Png, "png"),
        _ => match ext_lower.as_str() {
            "png" => (ImageFormat::Png, "png"),
            "webp" => (ImageFormat::WebP, "webp"),
            "bmp" => (ImageFormat::Bmp, "bmp"),
            _ => (ImageFormat::Jpeg, "jpg"),
        },
    };

    // 5. Ghi an toàn ra tệp tạm (.tmp_resize) trong cùng thư mục
    let tmp_path = path.with_extension(format!("tmp_resize_{}.{}", uuid::Uuid::new_v4().simple(), output_ext));

    {
        let file = fs::File::create(&tmp_path)
            .map_err(|e| format!("Không thể tạo file tạm: {}", e))?;
        let mut writer = BufWriter::new(file);

        if format == ImageFormat::Jpeg {
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut writer,
                config.quality.clamp(10, 100),
            );
            encoder
                .encode_image(&processed_img)
                .map_err(|e| format!("Lỗi mã hóa JPEG: {}", e))?;
        } else {
            processed_img
                .write_to(&mut writer, format)
                .map_err(|e| format!("Lỗi lưu ảnh: {}", e))?;
        }
    }

    // 6. Kiểm tra kích thước file tạm
    let new_size = fs::metadata(&tmp_path)
        .map(|m| m.len())
        .unwrap_or(original_size);

    // BẢO VỆ DUNG LƯỢNG: Nếu sau khi nén mà dung lượng mới lại LỚN HƠN hoặc BẰNG dung lượng gốc (khi giữ nguyên định dạng)
    // Tự động huỷ bỏ và giữ nguyên file gốc để tránh làm tệp tin phình to hơn!
    if new_size >= original_size && ext_lower == output_ext {
        let _ = fs::remove_file(&tmp_path);
        return Ok(ResizeResultItem {
            path: path_str.to_string(),
            original_size,
            new_size: original_size,
            original_width: orig_w,
            original_height: orig_h,
            new_width: orig_w,
            new_height: orig_h,
            success: true,
            skipped: true,
            skip_reason: Some("Dung lượng nén mới lớn hơn ảnh gốc, đã tự động giữ nguyên bản gốc tối ưu hơn".to_string()),
            error_message: None,
        });
    }

    // 7. Atomic Overwrite: Thay thế file gốc bằng file mới
    // Nếu đổi sang định dạng khác (ví dụ JPG -> WebP), xoá file cũ và lưu file mới
    let final_target_path: PathBuf = if ext_lower == output_ext {
        path.to_path_buf()
    } else {
        path.with_extension(output_ext)
    };

    if final_target_path != path && path.exists() {
        let _ = fs::remove_file(path);
    }

    if let Err(e) = fs::rename(&tmp_path, &final_target_path) {
        // Fallback: nếu rename khác partition thì copy rồi remove
        if let Err(copy_err) = fs::copy(&tmp_path, &final_target_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("Lỗi ghi đè file: {} (copy fallback: {})", e, copy_err));
        }
        let _ = fs::remove_file(&tmp_path);
    }

    Ok(ResizeResultItem {
        path: final_target_path.to_string_lossy().to_string(),
        original_size,
        new_size,
        original_width: orig_w,
        original_height: orig_h,
        new_width: target_w,
        new_height: target_h,
        success: true,
        skipped: false,
        skip_reason: None,
        error_message: None,
    })
}

/// Xử lý nén & ghi đè hàng loạt ảnh đa luồng với Rayon và gửi tiến độ thời gian thực
pub fn resize_images_batch_with_progress(
    paths: Vec<String>,
    config: ResizeConfig,
    app: Option<&tauri::AppHandle>,
) -> BatchResizeSummary {
    let total = paths.len();
    let counter = Arc::new(AtomicUsize::new(0));

    let items: Vec<ResizeResultItem> = paths
        .par_iter()
        .map(|p_str| {
            let res = resize_and_overwrite_single(p_str, &config);
            let current = counter.fetch_add(1, Ordering::SeqCst) + 1;

            if let Some(app_handle) = app {
                let percent = if total > 0 {
                    ((current as f64 / total as f64) * 100.0).round() as u8
                } else {
                    100
                };
                let _ = app_handle.emit(
                    "image-resize-progress",
                    ResizeProgressPayload {
                        current,
                        total,
                        current_file: p_str.clone(),
                        percent,
                    },
                );
            }

            match res {
                Ok(item) => item,
                Err(err_msg) => {
                    let (w, h, sz) = image::image_dimensions(Path::new(p_str))
                        .map(|(w, h)| (w, h, fs::metadata(p_str).map(|m| m.len()).unwrap_or(0)))
                        .unwrap_or((0, 0, 0));
                    ResizeResultItem {
                        path: p_str.clone(),
                        original_size: sz,
                        new_size: sz,
                        original_width: w,
                        original_height: h,
                        new_width: w,
                        new_height: h,
                        success: false,
                        skipped: false,
                        skip_reason: None,
                        error_message: Some(err_msg),
                    }
                }
            }
        })
        .collect();

    let succeeded = items.iter().filter(|i| i.success && !i.skipped).count();
    let skipped = items.iter().filter(|i| i.skipped).count();
    let failed = items.iter().filter(|i| !i.success).count();
    let original_size_total: u64 = items.iter().map(|i| i.original_size).sum();
    let new_size_total: u64 = items.iter().map(|i| i.new_size).sum();
    let saved_bytes = original_size_total as i64 - new_size_total as i64;

    BatchResizeSummary {
        total,
        succeeded,
        skipped,
        failed,
        original_size_total,
        new_size_total,
        saved_bytes,
        items,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_dimensions_aspect_ratio() {
        // Ảnh 4000x3000 (tỉ lệ 4:3), giới hạn max 1920x1080
        let (w, h) = calculate_new_dimensions(4000, 3000, 1920, 1080, true);
        assert_eq!(w, 1440);
        assert_eq!(h, 1080);
        assert!(w <= 1920 && h <= 1080);

        // Ảnh nhỏ hơn max: không bị phóng to
        let (w2, h2) = calculate_new_dimensions(800, 600, 1920, 1080, true);
        assert_eq!(w2, 800);
        assert_eq!(h2, 600);
    }

    #[test]
    fn test_supported_image_extensions() {
        assert!(is_supported_image(Path::new("photo.jpg")));
        assert!(is_supported_image(Path::new("photo.JPEG")));
        assert!(is_supported_image(Path::new("graphic.png")));
        assert!(is_supported_image(Path::new("web.webp")));
        assert!(!is_supported_image(Path::new("document.pdf")));
        assert!(!is_supported_image(Path::new("code.rs")));
    }
}

