using System.IO;

namespace CSharpFileRenamer.Core
{
    public class RenameRecord
    {
        public string OriginalPath { get; }
        public string NewPath { get; }

        public RenameRecord(string originalPath, string newPath)
        {
            OriginalPath = originalPath;
            NewPath = newPath;
        }
    }

    public class TransactionManager
    {
        private readonly Stack<RenameRecord> _history = new();
        private readonly object _lock = new();

        /// <summary>
        /// Tiền tố Win32 Long Path \\?\ để vượt giới hạn MAX_PATH (260 ký tự) trên Windows
        /// </summary>
        public static string ToExtendedPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            if (OperatingSystem.IsWindows() && path.Length >= 240 && !path.StartsWith(@"\\?\"))
            {
                var full = Path.GetFullPath(path);
                if (full.StartsWith(@"\\?\")) return full;
                if (full.StartsWith(@"\\")) return @"\\?\UNC\" + full.Substring(2);
                return @"\\?\" + full;
            }
            return path;
        }

        public int Commit(List<RenameItem> items)
        {
            lock (_lock)
            {
                var executedInThisSession = new List<RenameRecord>();
                var renamedCount = 0;

                try
                {
                    foreach (var item in items)
                    {
                        if (string.Equals(item.OriginalPath, item.TargetPath, StringComparison.OrdinalIgnoreCase))
                        {
                            item.Status = "unchanged";
                            continue;
                        }

                        var sourceExt = ToExtendedPath(item.OriginalPath);
                        var targetExt = ToExtendedPath(item.TargetPath);

                        if (File.Exists(sourceExt))
                        {
                            File.Move(sourceExt, targetExt);
                            var record = new RenameRecord(item.OriginalPath, item.TargetPath);
                            _history.Push(record);
                            executedInThisSession.Add(record);
                            item.Status = "renamed";
                            renamedCount++;
                        }
                        else if (Directory.Exists(sourceExt))
                        {
                            Directory.Move(sourceExt, targetExt);
                            var record = new RenameRecord(item.OriginalPath, item.TargetPath);
                            _history.Push(record);
                            executedInThisSession.Add(record);
                            item.Status = "renamed";
                            renamedCount++;
                        }
                    }

                    return renamedCount;
                }
                catch (Exception)
                {
                    // Tự động Rollback hoàn nguyên trạng thái nếu gặp lỗi giữa chừng
                    foreach (var record in executedInThisSession.AsEnumerable().Reverse())
                    {
                        try
                        {
                            var sExt = ToExtendedPath(record.OriginalPath);
                            var tExt = ToExtendedPath(record.NewPath);
                            if (File.Exists(tExt))
                            {
                                File.Move(tExt, sExt);
                            }
                            else if (Directory.Exists(tExt))
                            {
                                Directory.Move(tExt, sExt);
                            }
                        }
                        catch { }
                    }
                    throw;
                }
            }
        }

        public int Rollback()
        {
            lock (_lock)
            {
                var count = 0;
                while (_history.Count > 0)
                {
                    var record = _history.Pop();
                    try
                    {
                        var sExt = ToExtendedPath(record.OriginalPath);
                        var tExt = ToExtendedPath(record.NewPath);
                        if (File.Exists(tExt))
                        {
                            File.Move(tExt, sExt);
                            count++;
                        }
                        else if (Directory.Exists(tExt))
                        {
                            Directory.Move(tExt, sExt);
                            count++;
                        }
                    }
                    catch { }
                }
                return count;
            }
        }
    }
}
