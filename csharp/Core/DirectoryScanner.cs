using System.Diagnostics;
using System.IO;

namespace CSharpFileRenamer.Core
{
    public record ScanProgressInfo(
        int Count,
        string CurrentDirectory,
        int DirCount = 0,
        int SkippedCount = 0,
        string? LastSkippedPath = null
    );

    public static class DirectoryScanner
    {
        private static readonly HashSet<string> IgnoredDirectories = new(StringComparer.OrdinalIgnoreCase)
        {
            // System and OS root folders
            "$recycle.bin", "system volume information", "recovery", "$winreagent", 
            "config.msi", "$windows.~bt", "$windows.~ws", "windows", "msocache",
            // Cloud sync root folders (tránh kích hoạt download cloud placeholder làm treo I/O)
            "onedrivetemp",
            // Developer and package cache folders
            ".git", "node_modules", "target", "bin", "obj", ".svn", ".hg", 
            ".vscode", ".idea", "dist", "build", ".vs"
        };

        private static readonly HashSet<string> IgnoredFiles = new(StringComparer.OrdinalIgnoreCase)
        {
            "pagefile.sys", "hiberfil.sys", "dumpstack.log.tmp", "swapfile.sys"
        };

        public static List<string> Scan(string rootPath, bool recursive, bool includeHidden, bool includeFolders)
        {
            return ScanAsync(rootPath, recursive, includeHidden, includeFolders, null, CancellationToken.None).GetAwaiter().GetResult();
        }

        public static Task<List<string>> ScanAsync(
            string rootPath,
            bool recursive,
            bool includeHidden,
            bool includeFolders,
            IProgress<ScanProgressInfo>? progress = null,
            CancellationToken cancellationToken = default)
        {
            return Task.Run(() =>
            {
                if (!Directory.Exists(rootPath)) return new List<string>();

                var results = new List<string>();
                var dirQueue = new Queue<string>();
                dirQueue.Enqueue(rootPath);

                var sw = Stopwatch.StartNew();
                var lastReportMs = 0L;
                var dirCount = 0;
                var skippedCount = 0;
                string? lastSkippedPath = null;

                while (dirQueue.Count > 0)
                {
                    if (cancellationToken.IsCancellationRequested)
                    {
                        break;
                    }

                    var currentDir = dirQueue.Dequeue();
                    dirCount++;

                    // Báo cáo tiến độ thời gian thực (mỗi 40ms hoặc khi hàng đợi cạn)
                    if (progress != null && (sw.ElapsedMilliseconds - lastReportMs >= 40 || dirQueue.Count == 0))
                    {
                        lastReportMs = sw.ElapsedMilliseconds;
                        progress.Report(new ScanProgressInfo(results.Count, currentDir, dirCount, skippedCount, lastSkippedPath));
                    }

                    DirectoryInfo dirInfo;
                    try
                    {
                        dirInfo = new DirectoryInfo(currentDir);

                        // Bỏ qua Reparse Points (Junction, Symlink, Cloud placeholder như OneDrive) để chống lặp vô tận và treo
                        if ((dirInfo.Attributes & FileAttributes.ReparsePoint) != 0 && !currentDir.Equals(rootPath, StringComparison.OrdinalIgnoreCase))
                        {
                            skippedCount++;
                            lastSkippedPath = $"{currentDir} (Link liên kết / Junction)";
                            continue;
                        }
                    }
                    catch (Exception ex)
                    {
                        skippedCount++;
                        lastSkippedPath = $"{currentDir} ({ex.Message})";
                        continue;
                    }

                    // 1. Quét tệp tin trong thư mục hiện tại
                    try
                    {
                        foreach (var file in dirInfo.EnumerateFiles())
                        {
                            if (cancellationToken.IsCancellationRequested) break;

                            if (IgnoredFiles.Contains(file.Name)) continue;

                            if (!includeHidden)
                            {
                                if (file.Name.StartsWith(".") || (file.Attributes & FileAttributes.Hidden) != 0 || (file.Attributes & FileAttributes.System) != 0)
                                {
                                    continue;
                                }
                            }

                            results.Add(file.FullName);
                        }
                    }
                    catch (UnauthorizedAccessException)
                    {
                        skippedCount++;
                        lastSkippedPath = $"{currentDir} (Không có quyền đọc tệp)";
                    }
                    catch (Exception ex)
                    {
                        skippedCount++;
                        lastSkippedPath = $"{currentDir} ({ex.Message})";
                    }

                    if (cancellationToken.IsCancellationRequested) break;

                    // 2. Quét thư mục con (nếu recursive)
                    if (recursive)
                    {
                        try
                        {
                            foreach (var subDir in dirInfo.EnumerateDirectories())
                            {
                                if (cancellationToken.IsCancellationRequested) break;

                                // Bỏ qua thư mục hệ thống hoặc build
                                if (IgnoredDirectories.Contains(subDir.Name))
                                {
                                    skippedCount++;
                                    lastSkippedPath = $"{subDir.FullName} (Thư mục hệ thống)";
                                    continue;
                                }

                                // BỎ QUA REPARSE POINT (Junction / Symlink / OneDrive cloud placeholder) để tránh treo và lặp vô tận
                                try
                                {
                                    if ((subDir.Attributes & FileAttributes.ReparsePoint) != 0)
                                    {
                                        skippedCount++;
                                        lastSkippedPath = $"{subDir.FullName} (Junction / Cloud Reparse Point)";
                                        continue;
                                    }

                                    if (!includeHidden)
                                    {
                                        if (subDir.Name.StartsWith(".") || (subDir.Attributes & FileAttributes.Hidden) != 0 || (subDir.Attributes & FileAttributes.System) != 0)
                                        {
                                            continue;
                                        }
                                    }
                                }
                                catch (UnauthorizedAccessException)
                                {
                                    skippedCount++;
                                    lastSkippedPath = $"{subDir.FullName} (Bị từ chối truy cập)";
                                    continue;
                                }
                                catch
                                {
                                    continue;
                                }

                                if (includeFolders)
                                {
                                    results.Add(subDir.FullName);
                                }

                                dirQueue.Enqueue(subDir.FullName);
                            }
                        }
                        catch (UnauthorizedAccessException)
                        {
                            skippedCount++;
                            lastSkippedPath = $"{currentDir} (Không có quyền đọc thư mục con)";
                        }
                        catch (Exception ex)
                        {
                            skippedCount++;
                            lastSkippedPath = $"{currentDir} ({ex.Message})";
                        }
                    }
                }

                // Báo cáo số lượng cuối cùng
                progress?.Report(new ScanProgressInfo(results.Count, "Hoàn tất quét", dirCount, skippedCount, lastSkippedPath));

                results.Sort(StringComparer.OrdinalIgnoreCase);
                return results;
            }, cancellationToken);
        }
    }
}
