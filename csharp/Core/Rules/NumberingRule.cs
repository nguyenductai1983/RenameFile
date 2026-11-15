namespace CSharpFileRenamer.Core.Rules
{
    public enum NumberingPosition
    {
        Prefix,
        Suffix,
        ReplaceAll
    }

    public class NumberingRule : IRenameRule
    {
        public string Name => "NumberingRule";
        public string Description => $"Đánh số từ {Start}, bước {Step}, padding {Padding}";
        public TargetScope Scope { get; }

        public int Start { get; }
        public int Step { get; }
        public int Padding { get; }
        public NumberingPosition Position { get; }
        public string CustomText { get; }

        public NumberingRule(int start, int step, int padding, NumberingPosition position, string customText, TargetScope scope = TargetScope.StemOnly)
        {
            Start = start;
            Step = step;
            Padding = padding > 0 ? padding : 3;
            Position = position;
            CustomText = customText ?? "_";
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            var val = Start + context.Index * Step;
            var numStr = val.ToString($"D{Padding}");
            var sep = string.IsNullOrEmpty(CustomText) ? "_" : CustomText;

            return Position switch
            {
                NumberingPosition.Prefix => $"{numStr}{sep}{input}",
                NumberingPosition.Suffix => $"{input}{sep}{numStr}",
                NumberingPosition.ReplaceAll => string.IsNullOrEmpty(CustomText) ? numStr : $"{CustomText}{numStr}",
                _ => input
            };
        }
    }
}
