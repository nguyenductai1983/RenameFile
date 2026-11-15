using System.IO;

namespace CSharpFileRenamer.Core.Rules
{
    public class SmartTruncatePathRule : IRenameRule
    {
        public string Name => "Smart Truncate Path";
        public string Description => "Tự động co gọn tên file an toàn đường dẫn MAX_PATH (Middle-Ellipsis)";
        public TargetScope Scope => TargetScope.StemOnly;

        public int MaxLength { get; }
        public bool UseMiddle { get; }

        public SmartTruncatePathRule(int maxLength = 250, bool useMiddle = true)
        {
            MaxLength = maxLength > 0 ? maxLength : 250;
            UseMiddle = useMiddle;
        }

        public string Apply(string stem, FileContext context)
        {
            var parentDir = Path.GetDirectoryName(context.FullPath) ?? "";
            var parentLen = parentDir.Length;
            var extLen = string.IsNullOrEmpty(context.OriginalExtension) ? 0 : (context.OriginalExtension.Length + 1);

            // Ngân sách ký tự an toàn cho phần thân tên (Stem):
            // MaxLength - parentLen - 1 (cho dấu phân cách '\') - extLen
            var allowedStemLen = MaxLength - parentLen - 1 - extLen;
            if (allowedStemLen <= 0)
            {
                allowedStemLen = 10; // Ngưỡng tối thiểu an toàn để tránh chuỗi rỗng
            }

            if (stem.Length <= allowedStemLen)
            {
                return stem;
            }

            if (!UseMiddle || allowedStemLen <= 5)
            {
                return stem.Substring(0, Math.Min(stem.Length, allowedStemLen));
            }

            const string ellipsis = "...";
            if (allowedStemLen <= ellipsis.Length)
            {
                return stem.Substring(0, allowedStemLen);
            }

            var keepChars = allowedStemLen - ellipsis.Length;
            var headLen = (int)Math.Ceiling(keepChars * 0.6);
            var tailLen = keepChars - headLen;

            var head = stem.Substring(0, headLen);
            var tail = tailLen > 0 ? stem.Substring(stem.Length - tailLen) : "";

            return $"{head}{ellipsis}{tail}";
        }
    }
}
