using System.IO;

namespace CSharpFileRenamer.Core.Rules
{
    public class ChangeExtensionRule : IRenameRule
    {
        public string Name => "ChangeExtensionRule";
        public string Description => string.IsNullOrWhiteSpace(NewExtension) 
            ? "Xóa bỏ phần mở rộng của file" 
            : $"Đổi đuôi mở rộng thành: .{NewExtension.TrimStart('.')}";

        public TargetScope Scope => TargetScope.FullName;
        public string NewExtension { get; }

        public ChangeExtensionRule(string newExtension)
        {
            NewExtension = newExtension?.Trim().TrimStart('.') ?? "";
        }

        public string Apply(string input, FileContext context)
        {
            if (string.IsNullOrEmpty(input)) return input;

            if (string.IsNullOrEmpty(NewExtension))
            {
                // Xóa bỏ hoàn toàn phần mở rộng
                return Path.GetFileNameWithoutExtension(input);
            }

            return Path.ChangeExtension(input, NewExtension);
        }
    }
}
