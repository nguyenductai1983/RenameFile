using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;

namespace CSharpFileRenamer.Core
{
    public class RenamerEngine
    {
        public List<IRenameRule> Pipeline { get; } = new();

        public RenamerEngine() { }

        public RenamerEngine(IEnumerable<IRenameRule> rules)
        {
            Pipeline.AddRange(rules);
        }

        public string TransformName(FileContext context)
        {
            var stem = context.OriginalStem;
            var ext = context.OriginalExtension;

            foreach (var rule in Pipeline)
            {
                switch (rule.Scope)
                {
                    case TargetScope.StemOnly:
                        stem = rule.Apply(stem, context);
                        break;

                    case TargetScope.ExtensionOnly:
                        if (!string.IsNullOrEmpty(ext))
                        {
                            ext = rule.Apply(ext, context);
                        }
                        break;

                    case TargetScope.FullName:
                        var fullName = string.IsNullOrEmpty(ext) ? stem : $"{stem}.{ext}";
                        var transformed = rule.Apply(fullName, context);
                        stem = Path.GetFileNameWithoutExtension(transformed);
                        var newExt = Path.GetExtension(transformed);
                        ext = string.IsNullOrEmpty(newExt) ? "" : newExt.TrimStart('.');
                        break;
                }
            }

            return string.IsNullOrEmpty(ext) ? stem : $"{stem}.{ext}";
        }

        /// <summary>
        /// Tính toán xem trước đa luồng song song trên RAM bằng Parallel.For (Tương đương Rayon của Rust)
        /// </summary>
        public (List<RenameItem> items, double elapsedMs, double filesPerSec) GeneratePreview(IReadOnlyList<string> filePaths)
        {
            var sw = Stopwatch.StartNew();
            var total = filePaths.Count;
            var rawItems = new RenameItem[total];

            // 1. Tính toán song song đa luồng hoàn toàn trên RAM
            Parallel.For(0, total, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, i =>
            {
                var path = filePaths[i];
                var ctx = new FileContext(path, i, total);
                var newName = TransformName(ctx);

                var dir = Path.GetDirectoryName(path) ?? "";
                rawItems[i] = new RenameItem
                {
                    Index = i + 1,
                    OriginalPath = path,
                    OriginalName = ctx.OriginalName,
                    NewName = newName,
                    TargetPath = Path.Combine(dir, newName),
                    Status = newName == ctx.OriginalName ? "unchanged" : "pending"
                };
            });

            // 2. Xử lý xung đột tên (Collision Detection)
            var claimRegistry = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var resultItems = new List<RenameItem>(total);

            // Tối ưu hóa hiệu năng cực đại: Nếu danh sách lớn (> 2000 tệp), giải quyết xung đột thuần trên RAM
            // để tránh hàng trăm nghìn lần gọi File.Exists gây nghẽn I/O đĩa cứng kéo dài hàng chục giây.
            var checkDisk = total <= 2000;

            for (int i = 0; i < total; i++)
            {
                var item = rawItems[i];
                var dir = Path.GetDirectoryName(item.OriginalPath) ?? "";
                var currentNewName = item.NewName;
                var hasCollision = false;

                // Kiểm tra xem tên mới đã bị file khác trong lô xí chỗ hoặc đã tồn tại trên đĩa cứng chưa
                var targetPath = Path.Combine(dir, currentNewName);
                var isConflict = claimRegistry.Contains(targetPath) || 
                    (checkDisk && !targetPath.Equals(item.OriginalPath, StringComparison.OrdinalIgnoreCase) && 
                     (File.Exists(targetPath) || Directory.Exists(targetPath)));

                if (isConflict)
                {
                    hasCollision = true;
                    var stem = Path.GetFileNameWithoutExtension(currentNewName);
                    var ext = Path.GetExtension(currentNewName);
                    var counter = 1;

                    while (true)
                    {
                        var candidateName = string.IsNullOrEmpty(ext) ? $"{stem}_{counter}" : $"{stem}_{counter}{ext}";
                        var candidatePath = Path.Combine(dir, candidateName);

                        var isCandConflict = claimRegistry.Contains(candidatePath) || 
                            (checkDisk && !candidatePath.Equals(item.OriginalPath, StringComparison.OrdinalIgnoreCase) && 
                             (File.Exists(candidatePath) || Directory.Exists(candidatePath)));

                        if (!isCandConflict)
                        {
                            currentNewName = candidateName;
                            targetPath = candidatePath;
                            break;
                        }
                        counter++;
                    }
                }

                claimRegistry.Add(targetPath);
                item.NewName = currentNewName;
                item.TargetPath = targetPath;
                item.HasCollision = hasCollision;
                if (hasCollision)
                {
                    item.Status = "collision_resolved";
                }

                resultItems.Add(item);
            }

            sw.Stop();
            var elapsedMs = sw.Elapsed.TotalMilliseconds;
            var filesPerSec = elapsedMs > 0 ? (total / (elapsedMs / 1000.0)) : 0;

            return (resultItems, elapsedMs, filesPerSec);
        }
    }
}
