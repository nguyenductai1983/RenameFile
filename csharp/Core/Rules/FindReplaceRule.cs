using System.Text.RegularExpressions;

namespace CSharpFileRenamer.Core.Rules
{
    public class FindReplaceRule : IRenameRule
    {
        public string Name => "FindReplaceRule";
        public string Description => $"Tìm '{Find}' thay bằng '{Replace}'";
        public TargetScope Scope { get; }

        public string Find { get; }
        public string Replace { get; }
        public bool UseRegex { get; }
        public bool MatchCase { get; }

        public FindReplaceRule(string find, string replace, bool useRegex = false, bool matchCase = false, TargetScope scope = TargetScope.StemOnly)
        {
            Find = find ?? "";
            Replace = replace ?? "";
            UseRegex = useRegex;
            MatchCase = matchCase;
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(Find)) return input;

            if (UseRegex)
            {
                try
                {
                    var options = MatchCase ? RegexOptions.None : RegexOptions.IgnoreCase;
                    return Regex.Replace(input, Find, Replace, options);
                }
                catch
                {
                    return input; // Regex lỗi khi đang gõ, trả về chuỗi gốc an toàn
                }
            }
            else
            {
                var comparison = MatchCase ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
                return input.Replace(Find, Replace, comparison);
            }
        }
    }
}
