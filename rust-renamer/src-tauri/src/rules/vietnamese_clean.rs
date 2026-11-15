use crate::core::context::{FileContext, TargetScope};
use crate::core::rule::RenameRule;
use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::sync::OnceLock;
use unicode_normalization::UnicodeNormalization;

// Static Regex singletons initialized once via OnceLock
static COMBINING_MARKS_REGEX: OnceLock<Regex> = OnceLock::new();
static MULTI_SPACE_REGEX: OnceLock<Regex> = OnceLock::new();
static ILLEGAL_CHARS_REGEX: OnceLock<Regex> = OnceLock::new();
static SLUG_SPECIAL_CHARS_REGEX: OnceLock<Regex> = OnceLock::new();
static MULTI_DASH_REGEX: OnceLock<Regex> = OnceLock::new();
static MULTI_UNDERSCORE_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_combining_marks_regex() -> Result<&'static Regex> {
    if let Some(r) = COMBINING_MARKS_REGEX.get() {
        return Ok(r);
    }
    let re = Regex::new(r"\p{M}+").context("Failed to compile combining marks regex")?;
    let _ = COMBINING_MARKS_REGEX.set(re);
    COMBINING_MARKS_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve combining marks regex"))
}

fn get_multi_space_regex() -> Result<&'static Regex> {
    if let Some(r) = MULTI_SPACE_REGEX.get() {
        return Ok(r);
    }
    let re = Regex::new(r"\s+").context("Failed to compile multi-space regex")?;
    let _ = MULTI_SPACE_REGEX.set(re);
    MULTI_SPACE_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve multi-space regex"))
}

fn get_illegal_chars_regex() -> Result<&'static Regex> {
    if let Some(r) = ILLEGAL_CHARS_REGEX.get() {
        return Ok(r);
    }
    // Illegal OS characters: \ / : * ? " < > | and ASCII control characters 0x00-0x1F
    let re = Regex::new(r#"[\x00-\x1F\\/:*?"<>|]"#).context("Failed to compile illegal chars regex")?;
    let _ = ILLEGAL_CHARS_REGEX.set(re);
    ILLEGAL_CHARS_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve illegal chars regex"))
}

fn get_slug_special_chars_regex() -> Result<&'static Regex> {
    if let Some(r) = SLUG_SPECIAL_CHARS_REGEX.get() {
        return Ok(r);
    }
    // Allow ASCII letters, digits, and keep basic safe separators
    let re = Regex::new(r"[^a-zA-Z0-9\-_]+").context("Failed to compile slug special chars regex")?;
    let _ = SLUG_SPECIAL_CHARS_REGEX.set(re);
    SLUG_SPECIAL_CHARS_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve slug special chars regex"))
}

fn get_multi_dash_regex() -> Result<&'static Regex> {
    if let Some(r) = MULTI_DASH_REGEX.get() {
        return Ok(r);
    }
    let re = Regex::new(r"-{2,}").context("Failed to compile multi-dash regex")?;
    let _ = MULTI_DASH_REGEX.set(re);
    MULTI_DASH_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve multi-dash regex"))
}

fn get_multi_underscore_regex() -> Result<&'static Regex> {
    if let Some(r) = MULTI_UNDERSCORE_REGEX.get() {
        return Ok(r);
    }
    let re = Regex::new(r"_{2,}").context("Failed to compile multi-underscore regex")?;
    let _ = MULTI_UNDERSCORE_REGEX.set(re);
    MULTI_UNDERSCORE_REGEX
        .get()
        .ok_or_else(|| anyhow::anyhow!("Failed to retrieve multi-underscore regex"))
}

/// Hàm thuần túy loại bỏ dấu Tiếng Việt tuân thủ nghiêm ngặt quy trình 4 bước:
/// Bước 1: Replace Đ -> D, đ -> d
/// Bước 2: Chuẩn hóa Unicode NFD (tách nguyên âm và dấu tổ hợp)
/// Bước 3: Regex `\p{M}+` loại bỏ toàn bộ dấu thanh/dấu mũ tổ hợp
/// Bước 4: Chuẩn hóa Unicode NFC (tái hợp nhất về dạng dựng sẵn chuẩn Windows)
pub fn remove_vietnamese_diacritics(input: &str) -> Result<String> {
    // Bước 1: Thay thế Đ/đ độc lập trước khi tách NFD
    let step1: String = input
        .chars()
        .map(|c| match c {
            'Đ' => 'D',
            'đ' => 'd',
            other => other,
        })
        .collect();

    // Bước 2: Chuẩn hóa sang NFD (Canonical Decomposition)
    let step2_nfd: String = step1.nfd().collect();

    // Bước 3: Sử dụng Regex \p{M}+ biên dịch 1 lần để xóa sạch các combining marks
    let regex = get_combining_marks_regex()?;
    let step3_stripped = regex.replace_all(&step2_nfd, "");

    // Bước 4: Chuẩn hóa ngược lại NFC (Canonical Composition)
    let step4_nfc: String = step3_stripped.nfc().collect();

    Ok(step4_nfc)
}

/// 1. Quy tắc Loại bỏ dấu Tiếng Việt
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoveVietnameseDiacriticsRule {
    pub scope: TargetScope,
}

impl Default for RemoveVietnameseDiacriticsRule {
    fn default() -> Self {
        Self {
            scope: TargetScope::StemOnly,
        }
    }
}

impl RenameRule for RemoveVietnameseDiacriticsRule {
    fn name(&self) -> &'static str {
        "remove_vietnamese_diacritics"
    }

    fn description(&self) -> String {
        "Chuyển đổi ký tự tiếng Việt có dấu thành không dấu (Đ/đ -> D/d, NFD/NFC)".to_string()
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        let cleaned = remove_vietnamese_diacritics(input)?;
        if cleaned == input {
            Ok(Cow::Borrowed(input))
        } else {
            Ok(Cow::Owned(cleaned))
        }
    }
}

/// Dấu phân cách cho Web-safe Slug
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SlugSeparator {
    #[default]
    Hyphen, // "-"
    Underscore, // "_"
}

impl SlugSeparator {
    pub fn as_str(&self) -> &'static str {
        match self {
            SlugSeparator::Hyphen => "-",
            SlugSeparator::Underscore => "_",
        }
    }
}

/// 2. Quy tắc Chuẩn hóa Web-safe (Slugify)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebSafeSlugRule {
    pub separator: SlugSeparator,
    pub scope: TargetScope,
}

impl Default for WebSafeSlugRule {
    fn default() -> Self {
        Self {
            separator: SlugSeparator::Hyphen,
            scope: TargetScope::StemOnly,
        }
    }
}

impl RenameRule for WebSafeSlugRule {
    fn name(&self) -> &'static str {
        "web_safe_slug"
    }

    fn description(&self) -> String {
        format!("Chuẩn hóa Web-safe slug với dấu phân cách '{}'", self.separator.as_str())
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        // 1. Gỡ bỏ dấu tiếng Việt
        let unaccented = remove_vietnamese_diacritics(input)?;

        // 2. Chuyển thành lowercase
        let lowered = unaccented.to_lowercase();

        // 3. Thay thế các ký tự đặc biệt, khoảng trắng bằng separator
        let special_re = get_slug_special_chars_regex()?;
        let sep = self.separator.as_str();
        let replaced = special_re.replace_all(&lowered, sep);

        // 4. Gộp nhiều separator liên tiếp thành một
        let collapsed = match self.separator {
            SlugSeparator::Hyphen => {
                let re = get_multi_dash_regex()?;
                re.replace_all(&replaced, "-").into_owned()
            }
            SlugSeparator::Underscore => {
                let re = get_multi_underscore_regex()?;
                re.replace_all(&replaced, "_").into_owned()
            }
        };

        // 5. Trim separator ở 2 đầu
        let trimmed = collapsed.trim_matches(|c| c == '-' || c == '_').to_string();

        Ok(Cow::Owned(trimmed))
    }
}

/// 3. Quy tắc Dọn dẹp khoảng trắng (Trim & Collapse multi-space)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CleanWhitespaceRule {
    pub scope: TargetScope,
}

impl Default for CleanWhitespaceRule {
    fn default() -> Self {
        Self {
            scope: TargetScope::StemOnly,
        }
    }
}

impl RenameRule for CleanWhitespaceRule {
    fn name(&self) -> &'static str {
        "clean_whitespace"
    }

    fn description(&self) -> String {
        "Trim khoảng trắng 2 đầu và gộp nhiều khoảng trắng liên tiếp thành một".to_string()
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        let trimmed = input.trim();
        let space_re = get_multi_space_regex()?;
        let collapsed = space_re.replace_all(trimmed, " ");

        if collapsed == input {
            Ok(Cow::Borrowed(input))
        } else {
            Ok(Cow::Owned(collapsed.into_owned()))
        }
    }
}

/// 4. Quy tắc Loại bỏ ký tự bất hợp pháp (Sanitize OS illegal characters)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SanitizeFilenameRule {
    /// Chuỗi thay thế cho ký tự không hợp lệ (mặc định rỗng để xóa hẳn, hoặc "_" / "-")
    pub replacement: String,
    pub scope: TargetScope,
}

impl Default for SanitizeFilenameRule {
    fn default() -> Self {
        Self {
            replacement: String::new(),
            scope: TargetScope::FullName,
        }
    }
}

impl SanitizeFilenameRule {
    pub fn with_replacement(replacement: impl Into<String>) -> Self {
        Self {
            replacement: replacement.into(),
            scope: TargetScope::FullName,
        }
    }
}

impl RenameRule for SanitizeFilenameRule {
    fn name(&self) -> &'static str {
        "sanitize_filename"
    }

    fn description(&self) -> String {
        format!("Loại bỏ ký tự bất hợp pháp OS(\\ / : * ? \" < > |) thay bằng '{}'", self.replacement)
    }

    fn scope(&self) -> TargetScope {
        self.scope
    }

    fn apply<'a>(&self, input: &'a str, _context: &FileContext) -> Result<Cow<'a, str>> {
        let illegal_re = get_illegal_chars_regex()?;
        let sanitized = illegal_re.replace_all(input, self.replacement.as_str());

        // Trên Windows, tên file không được kết thúc bằng dấu chấm (.) hoặc khoảng trắng ( )
        let trimmed_end = sanitized.trim_end_matches(['.', ' ']);

        if trimmed_end == input {
            Ok(Cow::Borrowed(input))
        } else {
            Ok(Cow::Owned(trimmed_end.to_string()))
        }
    }
}
