using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace CSharpFileRenamer.Core.Rules
{
    public class VietnameseCleanRule : IRenameRule
    {
        public string Name => "VietnameseCleanRule";
        public string Description => "Xóa dấu Tiếng Việt (NFD/NFC, Đ/đ -> D/d)";
        public TargetScope Scope { get; }

        private static readonly Regex DiacriticsRegex = new Regex(@"\p{M}+", RegexOptions.Compiled);

        public VietnameseCleanRule(TargetScope scope = TargetScope.StemOnly)
        {
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            // Bước 1: Chuyển đổi ký tự Đ/đ riêng biệt
            var sb = new StringBuilder(input.Length);
            foreach (var ch in input)
            {
                if (ch == 'đ') sb.Append('d');
                else if (ch == 'Đ') sb.Append('D');
                else sb.Append(ch);
            }

            // Bước 2: Chuẩn hóa Unicode NFD (tách dấu ra khỏi nguyên âm)
            var nfd = sb.ToString().Normalize(NormalizationForm.FormD);

            // Bước 3: Loại bỏ các ký tự dấu tổ hợp (Non-spacing Marks \p{M})
            var withoutDiacritics = DiacriticsRegex.Replace(nfd, "");

            // Bước 4: Chuẩn hóa ngược lại về NFC
            return withoutDiacritics.Normalize(NormalizationForm.FormC);
        }
    }
}
