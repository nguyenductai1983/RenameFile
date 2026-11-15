using System.Text;
using System.Text.RegularExpressions;

namespace CSharpFileRenamer.Core.Rules
{
    public enum SpaceAction
    {
        RemoveAll,
        Trim,
        Collapse
    }

    public class SpaceRule : IRenameRule
    {
        public string Name => "SpaceRule";
        public string Description => Action switch
        {
            SpaceAction.RemoveAll => "Xóa tất cả khoảng trắng",
            SpaceAction.Trim => "Cắt bỏ khoảng trắng ở hai đầu",
            SpaceAction.Collapse => "Dồn nhiều khoảng trắng liên tiếp thành 1",
            _ => "Xử lý khoảng trắng"
        };

        public TargetScope Scope { get; }
        public SpaceAction Action { get; }

        private static readonly Regex MultiSpaceRegex = new Regex(@"\s+", RegexOptions.Compiled);

        public SpaceRule(SpaceAction action, TargetScope scope = TargetScope.StemOnly)
        {
            Action = action;
            Scope = scope;
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            return Action switch
            {
                SpaceAction.RemoveAll => string.Concat(input.Where(c => !char.IsWhiteSpace(c))),
                SpaceAction.Trim => input.Trim(),
                SpaceAction.Collapse => MultiSpaceRegex.Replace(input.Trim(), " "),
                _ => input
            };
        }
    }
}
