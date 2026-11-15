using System.Globalization;

namespace CSharpFileRenamer.Core.Rules
{
    public enum CaseType
    {
        Upper,
        Lower,
        Title,
        Sentence
    }

    public class CaseRule : IRenameRule
    {
        public string Name => "CaseRule";
        public string Description => $"Đổi kiểu chữ ({CaseType})";
        public TargetScope Scope { get; }
        public CaseType CaseType { get; }

        public CaseRule(CaseType caseType, TargetScope scope = TargetScope.StemOnly)
        {
            CaseType = caseType;
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            return CaseType switch
            {
                CaseType.Upper => input.ToUpperInvariant(),
                CaseType.Lower => input.ToLowerInvariant(),
                CaseType.Title => CultureInfo.CurrentCulture.TextInfo.ToTitleCase(input.ToLowerInvariant()),
                CaseType.Sentence => char.ToUpperInvariant(input[0]) + (input.Length > 1 ? input.Substring(1).ToLowerInvariant() : ""),
                _ => input
            };
        }
    }
}
