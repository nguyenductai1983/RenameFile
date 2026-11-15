using System.IO;

namespace CSharpFileRenamer.Core
{
    public class FileContext
    {
        public string FullPath { get; }
        public string OriginalName { get; }
        public string OriginalStem { get; }
        public string OriginalExtension { get; }
        public int Index { get; }
        public int Total { get; }

        public FileContext(string path, int index, int total)
        {
            FullPath = path;
            OriginalName = Path.GetFileName(path);
            OriginalStem = Path.GetFileNameWithoutExtension(path);
            var ext = Path.GetExtension(path);
            OriginalExtension = string.IsNullOrEmpty(ext) ? "" : ext.TrimStart('.');
            Index = index;
            Total = total;
        }
    }
}
