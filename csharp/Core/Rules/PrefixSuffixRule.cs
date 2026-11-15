namespace CSharpFileRenamer.Core.Rules
{
    public class PrefixSuffixRule : IRenameRule
    {
        public string Name => "PrefixSuffixRule";
        public string Description => $"Tiền tố: '{Prefix}', Hậu tố: '{Suffix}'";
        public TargetScope Scope { get; }

        public string Prefix { get; }
        public string Suffix { get; }

        public PrefixSuffixRule(string prefix, string suffix, TargetScope scope = TargetScope.StemOnly)
        {
            Prefix = prefix ?? "";
            Suffix = suffix ?? "";
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(Prefix) && string.IsNullOrEmpty(Suffix)) return input;
            return $"{Prefix}{input}{Suffix}";
        }
    }
}
