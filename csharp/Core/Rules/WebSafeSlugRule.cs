using System.Text.RegularExpressions;

namespace CSharpFileRenamer.Core.Rules
{
    public class WebSafeSlugRule : IRenameRule
    {
        public string Name => "WebSafeSlugRule";
        public string Description => $"Chuẩn hóa Web-safe Slug (Dùng '{Separator}')";
        public TargetScope Scope { get; }
        public string Separator { get; }

        private readonly VietnameseCleanRule _vietnameseCleaner = new VietnameseCleanRule();
        private static readonly Regex NonAlphanumeric = new Regex(@"[^a-z0-9]+", RegexOptions.Compiled);

        public WebSafeSlugRule(string separator = "-", TargetScope scope = TargetScope.StemOnly)
        {
            Separator = separator == "_" ? "_" : "-";
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            // Xóa dấu tiếng Việt trước
            var clean = _vietnameseCleaner.Apply(input, context).ToLowerInvariant();

            // Thay thế mọi chuỗi không phải chữ/số thành dấu phân cách
            var slug = NonAlphanumeric.Replace(clean, Separator);

            // Cắt bỏ dấu phân cách ở 2 đầu
            return slug.Trim(Separator[0]);
        }
    }
}
