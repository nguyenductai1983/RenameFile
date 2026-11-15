use rename_file_viet::core::context::TargetScope;
use rename_file_viet::core::engine::{RenameStatus, RenamerEngine};
use rename_file_viet::core::rule::RenameRule;
use rename_file_viet::rules::vietnamese_clean::{
    remove_vietnamese_diacritics, CleanWhitespaceRule, RemoveVietnameseDiacriticsRule,
    SanitizeFilenameRule, SlugSeparator, WebSafeSlugRule,
};
use std::path::PathBuf;
use unicode_normalization::UnicodeNormalization;

#[test]
fn test_vietnamese_diacritics_removal_core_string() {
    let input = " Tài Liệu (Mật): Đ/đ Hệ Thống 2026.pdf ";
    let result = remove_vietnamese_diacritics(input).expect("Should successfully strip diacritics");

    // Đ/đ phải thành D/d, các nguyên âm có dấu thành không dấu
    assert_eq!(result, " Tai Lieu (Mat): D/d He Thong 2026.pdf ");
}

#[test]
fn test_nfd_mac_compatibility() {
    // Giả lập chuỗi được gõ hoặc lưu từ macOS (NFD decomposition)
    let nfc_input = "Tài Liệu: Đ/đ Hệ Thống";
    let nfd_input: String = nfc_input.nfd().collect();

    let result = remove_vietnamese_diacritics(&nfd_input).expect("Should handle NFD stream cleanly");
    assert_eq!(result, "Tai Lieu: D/d He Thong");
}

#[test]
fn test_clean_whitespace_rule() {
    let input = "   Tài Liệu   (Mật):   Đ/đ   Hệ Thống   2026.pdf   ";
    let context = rename_file_viet::core::context::FileContext::new(
        PathBuf::from(input),
        0,
        1,
    );

    let rule = CleanWhitespaceRule::default();
    let cleaned = rule.apply(input, &context).expect("Clean whitespace should succeed");

    assert_eq!(cleaned, "Tài Liệu (Mật): Đ/đ Hệ Thống 2026.pdf");
}

#[test]
fn test_sanitize_os_illegal_characters() {
    let input = "Tài Liệu (Mật): Đ/đ Hệ Thống 2026.pdf";
    let context = rename_file_viet::core::context::FileContext::new(
        PathBuf::from(input),
        0,
        1,
    );

    // Thay thế ký tự cấm (: và /) bằng dấu gạch dưới "_"
    let rule = SanitizeFilenameRule {
        replacement: "_".to_string(),
        scope: TargetScope::FullName,
    };

    let sanitized = rule.apply(input, &context).expect("Sanitize should succeed");
    assert_eq!(sanitized, "Tài Liệu (Mật)_ Đ_đ Hệ Thống 2026.pdf");
}

#[test]
fn test_web_safe_slug() {
    let input_stem = " Tài Liệu (Mật): Đ/đ Hệ Thống 2026 ";
    let context = rename_file_viet::core::context::FileContext::new(
        PathBuf::from(input_stem),
        0,
        1,
    );

    let rule = WebSafeSlugRule {
        separator: SlugSeparator::Hyphen,
        scope: TargetScope::StemOnly,
    };

    let slug = rule.apply(input_stem, &context).expect("Slugify should succeed");
    assert_eq!(slug, "tai-lieu-mat-d-d-he-thong-2026");
}

#[test]
fn test_full_pipeline_with_renamer_engine() {
    // Pipeline kết hợp: Loại bỏ dấu -> Làm sạch ký tự cấm -> Dọn dẹp khoảng trắng
    let mut engine = RenamerEngine::new();
    engine
        .add_rule(RemoveVietnameseDiacriticsRule {
            scope: TargetScope::StemOnly,
        })
        .add_rule(SanitizeFilenameRule {
            replacement: "-".to_string(),
            scope: TargetScope::StemOnly,
        })
        .add_rule(CleanWhitespaceRule {
            scope: TargetScope::StemOnly,
        });

    let raw_path = PathBuf::from(" Tài Liệu (Mật): Đ/đ Hệ Thống 2026.pdf ");
    let preview_items = engine.generate_preview(&[raw_path]).expect("Preview generation failed");

    assert_eq!(preview_items.len(), 1);
    let item = &preview_items[0];

    assert_eq!(item.status, RenameStatus::Pending);
    // Stem ban đầu: " Tài Liệu (Mật): Đ/đ Hệ Thống 2026 "
    // 1. Remove diacritics -> " Tai Lieu (Mat): D/d He Thong 2026 "
    // 2. Sanitize (: và / thành -) -> " Tai Lieu (Mat)- D-d He Thong 2026 "
    // 3. Clean whitespace -> "Tai Lieu (Mat)- D-d He Thong 2026"
    // Extension: "pdf"
    assert_eq!(item.new_name, "Tai Lieu (Mat)- D-d He Thong 2026.pdf");
}
