use crate::core::context::{FileContext, TargetScope};
use anyhow::Result;
use std::borrow::Cow;
use std::fmt::Debug;

/// Trait cốt lõi cho mọi quy tắc đổi tên (Extensible Open-Closed Principle).
/// Mọi tính năng từ làm sạch tên, Regex, Tiền tố/Hậu tố đến Metadata đều implement trait này.
pub trait RenameRule: Send + Sync + Debug {
    /// Định danh duy nhất của quy tắc (dùng cho logging, UI preview, presets JSON)
    fn name(&self) -> &'static str;

    /// Mô tả chi tiết về tham số của quy tắc
    fn description(&self) -> String {
        self.name().to_string()
    }

    /// Phạm vi tác động của quy tắc: Tên chính (Stem), Phần mở rộng (Ext), hoặc Toàn bộ (FullName)
    fn scope(&self) -> TargetScope {
        TargetScope::StemOnly
    }

    /// Thực thi quy tắc biến đổi chuỗi.
    /// Sử dụng `Cow<'a, str>` để tối ưu bộ nhớ: nếu chuỗi không thay đổi, không cấp phát heap mới (Zero-copy).
    fn apply<'a>(&self, input: &'a str, context: &FileContext) -> Result<Cow<'a, str>>;
}
