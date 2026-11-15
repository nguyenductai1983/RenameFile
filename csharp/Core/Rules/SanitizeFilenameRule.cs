using System.Text;

namespace CSharpFileRenamer.Core.Rules
{
    public class SanitizeFilenameRule : IRenameRule
    {
        public string Name => "SanitizeFilenameRule";
        public string Description => "Làm sạch ký tự cấm hệ điều hành (\\ / : * ? \" < > |)";
        public TargetScope Scope { get; }
        public string Replacement { get; }

        private static readonly HashSet<char> IllegalChars = new HashSet<char>
        {
            '\\', '/', ':', '*', '?', '"', '<', '>', '|'
        };

        public SanitizeFilenameRule(string replacement = "_", TargetScope scope = TargetScope.FullName)
        {
            Replacement = replacement ?? "";
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            var sb = new StringBuilder(input.Length);
            foreach (var ch in input)
            {
                if (IllegalChars.Contains(ch))
                {
                    sb.Append(Replacement);
                }
                else
                {
                    sb.Append(ch);
                }
            }
            return sb.ToString();
        }
    }
}
