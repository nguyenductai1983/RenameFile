use crate::core::context::{FileContext, TargetScope};
use crate::core::rule::RenameRule;
use anyhow::Result;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::path::PathBuf;

/// Hành động xử lý khoảng trắng trong tên tệp
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpaceAction {
    /// Xóa toàn bộ ký tự khoảng trắng
    RemoveAll,
    /// Xóa khoảng trắng ở 2 đầu chuỗi (Trim)
    Trim,
    /// Dồn nhiều khoảng trắng liên tiếp thành một khoảng trắng duy nhất
    Collapse,
}

/// Quy tắc xử lý khoảng trắng trong tên file
#[derive(Debug, Clone)]
pub struct SpaceRule {
    pub action: SpaceAction,
    pub scope: TargetScope,
}

impl SpaceRule {
    pub fn new(action: SpaceAction, scope: TargetScope) -> Self {
        Self { action, scope }
    }
}

impl RenameRule for SpaceRule {
    fn name(&self) -> &'static str {
        "SpaceRule"
    }

    fn description(&self) -> String {
        match self.action {
            SpaceAction::RemoveAll => "Xóa tất cả khoảng trắng".to_string(),
            SpaceAction::Trim => "Xóa khoảng trắng ở hai đầu".to_string(),
            SpaceAction::Collapse => "Dồn nhiều khoảng trắng liên tiếp thành 1".to_string(),
        }
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        match self.action {
            SpaceAction::RemoveAll => {
                if !input.chars().any(char::is_whitespace) {
                    return Ok(Cow::Borrowed(input));
                }
                let cleaned: String = input.chars().filter(|c| !c.is_whitespace()).collect();
                Ok(Cow::Owned(cleaned))
            }
            SpaceAction::Trim => {
                let trimmed = input.trim();
                if trimmed.len() == input.len() {
                    Ok(Cow::Borrowed(input))
                } else {
                    Ok(Cow::Owned(trimmed.to_string()))
                }
            }
            SpaceAction::Collapse => {
                let trimmed = input.trim();
                let mut collapsed = String::with_capacity(trimmed.len());
                let mut prev_is_space = false;

                for c in trimmed.chars() {
                    if c.is_whitespace() {
                        if !prev_is_space {
                            collapsed.push(' ');
                            prev_is_space = true;
                        }
                    } else {
                        collapsed.push(c);
                        prev_is_space = false;
                    }
                }

                if collapsed == input {
                    Ok(Cow::Borrowed(input))
                } else {
                    Ok(Cow::Owned(collapsed))
                }
            }
        }
    }
}

/// Quy tắc thay đổi hoặc gán lại phần mở rộng (extension) của tệp tin một cách an toàn
#[derive(Debug, Clone)]
pub struct ChangeExtensionRule {
    pub new_extension: String,
}

impl ChangeExtensionRule {
    pub fn new<S: Into<String>>(new_extension: S) -> Self {
        Self {
            new_extension: new_extension.into(),
        }
    }
}

impl RenameRule for ChangeExtensionRule {
    fn name(&self) -> &'static str {
        "ChangeExtensionRule"
    }

    fn description(&self) -> String {
        let clean = self.new_extension.trim().trim_start_matches('.');
        if clean.is_empty() {
            "Xóa bỏ phần mở rộng của file".to_string()
        } else {
            format!("Đổi phần mở rộng thành: .{}", clean)
        }
    }

    fn scope(&self) -> TargetScope {
        TargetScope::FullName
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        let clean_ext = self.new_extension.trim().trim_start_matches('.');
        let mut path_buf = PathBuf::from(input);

        if clean_ext.is_empty() {
            path_buf.set_extension("");
        } else {
            path_buf.set_extension(clean_ext);
        }

        let new_name = match path_buf.file_name() {
            Some(name) => name.to_string_lossy().into_owned(),
            None => input.to_string(),
        };

        if new_name == input {
            Ok(Cow::Borrowed(input))
        } else {
            Ok(Cow::Owned(new_name))
        }
    }
}

/// Quy tắc Tìm kiếm và Thay thế (Hỗ trợ Text thường hoặc Regular Expression)
#[derive(Debug, Clone)]
pub struct FindReplaceRule {
    pub find: String,
    pub replace: String,
    pub use_regex: bool,
    pub match_case: bool,
    pub scope: TargetScope,
}

impl FindReplaceRule {
    pub fn new(
        find: String,
        replace: String,
        use_regex: bool,
        match_case: bool,
        scope: TargetScope,
    ) -> Self {
        Self {
            find,
            replace,
            use_regex,
            match_case,
            scope,
        }
    }
}

impl RenameRule for FindReplaceRule {
    fn name(&self) -> &'static str {
        "FindReplaceRule"
    }

    fn description(&self) -> String {
        format!("Tìm '{}' thay bằng '{}'", self.find, self.replace)
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        if self.find.is_empty() {
            return Ok(Cow::Borrowed(input));
        }

        if self.use_regex {
            let re = match RegexBuilder::new(&self.find)
                .case_insensitive(!self.match_case)
                .build()
            {
                Ok(r) => r,
                Err(_) => return Ok(Cow::Borrowed(input)), // Regex chưa hoàn chỉnh khi gõ, trả về tên gốc an toàn
            };

            let replaced = re.replace_all(input, self.replace.as_str());
            match replaced {
                Cow::Borrowed(_) => Ok(Cow::Borrowed(input)),
                Cow::Owned(s) => Ok(Cow::Owned(s)),
            }
        } else if self.match_case {
            if !input.contains(&self.find) {
                return Ok(Cow::Borrowed(input));
            }
            Ok(Cow::Owned(input.replace(&self.find, &self.replace)))
        } else {
            // Case-insensitive text replace an toàn
            let escaped = regex::escape(&self.find);
            let re = match RegexBuilder::new(&escaped).case_insensitive(true).build() {
                Ok(r) => r,
                Err(_) => return Ok(Cow::Borrowed(input)),
            };
            let replaced = re.replace_all(input, self.replace.as_str());
            match replaced {
                Cow::Borrowed(_) => Ok(Cow::Borrowed(input)),
                Cow::Owned(s) => Ok(Cow::Owned(s)),
            }
        }
    }
}

/// Quy tắc Thêm Tiền tố (Prefix) và Hậu tố (Suffix)
#[derive(Debug, Clone)]
pub struct PrefixSuffixRule {
    pub prefix: String,
    pub suffix: String,
    pub scope: TargetScope,
}

impl PrefixSuffixRule {
    pub fn new(prefix: String, suffix: String, scope: TargetScope) -> Self {
        Self {
            prefix,
            suffix,
            scope,
        }
    }
}

impl RenameRule for PrefixSuffixRule {
    fn name(&self) -> &'static str {
        "PrefixSuffixRule"
    }

    fn description(&self) -> String {
        format!("Tiền tố: '{}', Hậu tố: '{}'", self.prefix, self.suffix)
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        if self.prefix.is_empty() && self.suffix.is_empty() {
            return Ok(Cow::Borrowed(input));
        }
        Ok(Cow::Owned(format!(
            "{}{}{}",
            self.prefix, input, self.suffix
        )))
    }
}

/// Vị trí chèn số thứ tự
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberingPosition {
    /// Thêm số thứ tự vào trước tên file
    Prefix,
    /// Thêm số thứ tự vào sau tên file
    Suffix,
    /// Thay thế toàn bộ tên file bằng tiền tố tùy chọn + số thứ tự
    ReplaceAll,
}

/// Quy tắc Đánh số thứ tự tăng dần tự động (Numbering / Auto Indexing)
#[derive(Debug, Clone)]
pub struct NumberingRule {
    pub start: usize,
    pub step: usize,
    pub padding: usize,
    pub position: NumberingPosition,
    pub custom_text: String,
    pub scope: TargetScope,
}

impl NumberingRule {
    pub fn new(
        start: usize,
        step: usize,
        padding: usize,
        position: NumberingPosition,
        custom_text: String,
        scope: TargetScope,
    ) -> Self {
        Self {
            start,
            step,
            padding,
            position,
            custom_text,
            scope,
        }
    }
}

impl RenameRule for NumberingRule {
    fn name(&self) -> &'static str {
        "NumberingRule"
    }

    fn description(&self) -> String {
        format!(
            "Đánh số từ {}, bước nhảy {}, padding {}",
            self.start, self.step, self.padding
        )
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, context: &FileContext) -> Result<Cow<'a, str>> {
        let current_val = self.start + context.index * self.step;
        let num_str = format!("{:0>width$}", current_val, width = self.padding);

        let sep = if self.custom_text.is_empty() {
            "_"
        } else {
            &self.custom_text
        };

        match self.position {
            NumberingPosition::Prefix => Ok(Cow::Owned(format!("{}{}{}", num_str, sep, input))),
            NumberingPosition::Suffix => Ok(Cow::Owned(format!("{}{}{}", input, sep, num_str))),
            NumberingPosition::ReplaceAll => {
                if self.custom_text.is_empty() {
                    Ok(Cow::Owned(num_str))
                } else {
                    Ok(Cow::Owned(format!("{}{}", self.custom_text, num_str)))
                }
            }
        }
    }
}

/// Kiểu chữ hoa thường
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaseType {
    /// TOÀN BỘ CHỮ HOA (UPPERCASE)
    Upper,
    /// toàn bộ chữ thường (lowercase)
    Lower,
    /// Viết Hoa Chữ Cái Đầu Mỗi Từ (Title Case)
    Title,
    /// Viết hoa chữ cái đầu tiên của câu (Sentence case)
    Sentence,
}

/// Quy tắc Đổi kiểu chữ (Case Transformation)
#[derive(Debug, Clone)]
pub struct CaseRule {
    pub case_type: CaseType,
    pub scope: TargetScope,
}

impl CaseRule {
    pub fn new(case_type: CaseType, scope: TargetScope) -> Self {
        Self { case_type, scope }
    }
}

impl RenameRule for CaseRule {
    fn name(&self) -> &'static str {
        "CaseRule"
    }

    fn description(&self) -> String {
        match self.case_type {
            CaseType::Upper => "Chuyển thành CHỮ HOA".to_string(),
            CaseType::Lower => "Chuyển thành chữ thường".to_string(),
            CaseType::Title => "Viết Hoa Chữ Đầu Mỗi Từ".to_string(),
            CaseType::Sentence => "Viết hoa chữ đầu câu".to_string(),
        }
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        match self.case_type {
            CaseType::Upper => Ok(Cow::Owned(input.to_uppercase())),
            CaseType::Lower => Ok(Cow::Owned(input.to_lowercase())),
            CaseType::Sentence => {
                let mut chars = input.chars();
                match chars.next() {
                    None => Ok(Cow::Borrowed(input)),
                    Some(first) => {
                        let mut result = first.to_uppercase().to_string();
                        for c in chars {
                            result.extend(c.to_lowercase());
                        }
                        Ok(Cow::Owned(result))
                    }
                }
            }
            CaseType::Title => {
                let mut result = String::with_capacity(input.len());
                let mut capitalize_next = true;

                for c in input.chars() {
                    if c.is_alphanumeric() {
                        if capitalize_next {
                            result.extend(c.to_uppercase());
                            capitalize_next = false;
                        } else {
                            result.extend(c.to_lowercase());
                        }
                    } else {
                        result.push(c);
                        capitalize_next = true;
                    }
                }
                Ok(Cow::Owned(result))
            }
        }
    }
}

/// Quy tắc Co gọn thông minh để đảm bảo Full Path không vượt quá giới hạn hệ thống
#[derive(Debug, Clone)]
pub struct SmartTruncatePathRule {
    /// Giới hạn độ dài Full Path an toàn (mặc định 250 ký tự)
    pub max_full_path: usize,
    /// Sử dụng thuật toán cắt giữa (giữ lại phần đầu và phần đuôi chứa phiên bản/ngày tháng)
    pub use_middle_ellipsis: bool,
}

impl SmartTruncatePathRule {
    pub fn new(max_full_path: usize, use_middle_ellipsis: bool) -> Self {
        Self {
            max_full_path: if max_full_path == 0 { 250 } else { max_full_path },
            use_middle_ellipsis,
        }
    }
}

impl RenameRule for SmartTruncatePathRule {
    fn name(&self) -> &'static str {
        "SmartTruncatePathRule"
    }

    fn description(&self) -> String {
        format!("Co gọn Full Path an toàn tối đa {} ký tự", self.max_full_path)
    }

    fn scope(&self) -> TargetScope {
        TargetScope::FullName
    }

    fn apply<'a>(&self, input: &'a str, context: &FileContext) -> Result<Cow<'a, str>> {
        let parent = context.original_path.parent().unwrap_or_else(|| std::path::Path::new(""));
        let parent_str = parent.to_string_lossy();
        let parent_len = parent_str.len();

        // Độ dài Full Path hiện tại nếu dùng tên `input`
        let current_total_len = parent_len + 1 + input.len();
        if current_total_len <= self.max_full_path {
            return Ok(Cow::Borrowed(input));
        }

        // Tách stem và extension
        let path = PathBuf::from(input);
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| input.to_string());

        // Ngân sách tối đa cho stem
        let reserved_len = parent_len + 1 + ext.len();
        if reserved_len >= self.max_full_path {
            return Ok(Cow::Borrowed(input));
        }

        let max_stem_len = self.max_full_path - reserved_len;
        if stem.len() <= max_stem_len {
            return Ok(Cow::Borrowed(input));
        }

        if max_stem_len <= 5 {
            let truncated: String = stem.chars().take(max_stem_len).collect();
            return Ok(Cow::Owned(format!("{}{}", truncated, ext)));
        }

        if self.use_middle_ellipsis && max_stem_len >= 12 {
            // Thuật toán Cắt Giữa: Giữ 60% đầu, 40% đuôi, chèn "..."
            let budget = max_stem_len.saturating_sub(3);
            let head_count = (budget as f64 * 0.6) as usize;
            let tail_count = budget.saturating_sub(head_count);

            let head: String = stem.chars().take(head_count).collect();
            let total_chars = stem.chars().count();
            let tail: String = stem.chars().skip(total_chars.saturating_sub(tail_count)).collect();

            let new_stem = format!("{}...{}", head, tail);
            Ok(Cow::Owned(format!("{}{}", new_stem, ext)))
        } else {
            let budget = max_stem_len.saturating_sub(3);
            let head: String = stem.chars().take(budget).collect();
            Ok(Cow::Owned(format!("{}...{}", head, ext)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_space_rule_remove_all() -> Result<()> {
        let rule = SpaceRule::new(SpaceAction::RemoveAll, TargetScope::StemOnly);
        let ctx = FileContext::new(PathBuf::from("my document 2026.pdf"), 0, 1);

        let res = rule.apply("my document 2026", &ctx)?;
        assert_eq!(res, "mydocument2026");

        let no_space = rule.apply("nodata", &ctx)?;
        assert!(matches!(no_space, Cow::Borrowed(_)));

        Ok(())
    }

    #[test]
    fn test_find_replace_rule() -> Result<()> {
        let rule = FindReplaceRule::new(
            "IMG".to_string(),
            "Photo".to_string(),
            false,
            false,
            TargetScope::StemOnly,
        );
        let ctx = FileContext::new(PathBuf::from("img_001.jpg"), 0, 1);
        let res = rule.apply("img_001", &ctx)?;
        assert_eq!(res, "Photo_001");
        Ok(())
    }

    #[test]
    fn test_numbering_rule() -> Result<()> {
        let rule = NumberingRule::new(
            1,
            1,
            3,
            NumberingPosition::Suffix,
            "_".to_string(),
            TargetScope::StemOnly,
        );
        let ctx = FileContext::new(PathBuf::from("file.txt"), 4, 10);
        let res = rule.apply("photo", &ctx)?;
        assert_eq!(res, "photo_005");
        Ok(())
    }

    #[test]
    fn test_case_rule_title() -> Result<()> {
        let rule = CaseRule::new(CaseType::Title, TargetScope::StemOnly);
        let ctx = FileContext::new(PathBuf::from("file.txt"), 0, 1);
        let res = rule.apply("nguyen_van_a", &ctx)?;
        assert_eq!(res, "Nguyen_Van_A");
        Ok(())
    }

    #[test]
    fn test_smart_truncate_path_rule() -> Result<()> {
        // Giả sử đường dẫn cha dài 30 ký tự, file gốc dài 50 ký tự, max_full_path = 60
        let rule = SmartTruncatePathRule::new(60, true);
        let ctx = FileContext::new(PathBuf::from("D:/VeryLongFolderDirectoryName/file.txt"), 0, 1);
        let res = rule.apply("BaoCaoKhaoSatThiTruongNongSanXuatKhauChauAu2026_VerFinal.docx", &ctx)?;
        
        let parent_len = ctx.original_path.parent().unwrap().to_string_lossy().len();
        let total_new_len = parent_len + 1 + res.len();
        assert!(total_new_len <= 60, "Tổng chiều dài {} phải <= 60", total_new_len);
        assert!(res.ends_with(".docx"), "Phải giữ nguyên extension .docx");
        assert!(res.contains("..."), "Thuật toán cắt giữa phải có dấu ...");
        Ok(())
    }
}
