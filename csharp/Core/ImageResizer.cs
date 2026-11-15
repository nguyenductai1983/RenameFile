using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace CSharpFileRenamer.Core
{
    public class ImageInspectResult
    {
        public string FilePath { get; set; } = "";
        public string FileName { get; set; } = "";
        public int Width { get; set; }
        public int Height { get; set; }
        public long FileSize { get; set; }
        public string Format { get; set; } = "";
        public bool IsValid { get; set; }
        public string? Error { get; set; }
    }

    public class ImageResizeResult
    {
        public string FilePath { get; set; } = "";
        public bool Success { get; set; }
        public bool Skipped { get; set; }
        public string? SkipReason { get; set; }
        public long OldSize { get; set; }
        public long NewSize { get; set; }
        public int OldWidth { get; set; }
        public int OldHeight { get; set; }
        public int NewWidth { get; set; }
        public int NewHeight { get; set; }
        public string? ErrorMessage { get; set; }
    }

    public static class ImageResizer
    {
        private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff", ".gif"
        };

        public static bool IsSupportedImage(string path)
        {
            var ext = Path.GetExtension(path);
            return !string.IsNullOrEmpty(ext) && SupportedExtensions.Contains(ext);
        }

        public static ImageInspectResult InspectImage(string filePath)
        {
            var result = new ImageInspectResult
            {
                FilePath = filePath,
                FileName = Path.GetFileName(filePath),
                Format = Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant()
            };

            try
            {
                var fileInfo = new FileInfo(filePath);
                if (!fileInfo.Exists)
                {
                    result.Error = "Tệp không tồn tại";
                    return result;
                }
                result.FileSize = fileInfo.Length;

                // Đọc metadata qua BitmapDecoder không giải nén toàn bộ bitmap vào RAM
                using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
                var decoder = BitmapDecoder.Create(fs, BitmapCreateOptions.DelayCreation, BitmapCacheOption.None);
                if (decoder.Frames.Count > 0)
                {
                    var frame = decoder.Frames[0];
                    result.Width = frame.PixelWidth;
                    result.Height = frame.PixelHeight;
                    result.IsValid = result.Width > 0 && result.Height > 0;
                }
                else
                {
                    result.Error = "Không tìm thấy frame ảnh";
                }
            }
            catch (Exception ex)
            {
                result.Error = ex.Message;
                result.IsValid = false;
            }

            return result;
        }

        public static (int width, int height) CalculateNewDimensions(
            int origW, 
            int origH, 
            int maxW, 
            int maxH, 
            bool maintainAspect)
        {
            if (origW <= 0 || origH <= 0) return (origW, origH);
            if (maxW <= 0 && maxH <= 0) return (origW, origH);

            // BẢO VỆ 1: Nếu kích thước ban đầu đã nhỏ hơn hoặc bằng kích thước đích -> KHÔNG UPSCALE
            bool widthAlreadySmaller = maxW == 0 || origW <= maxW;
            bool heightAlreadySmaller = maxH == 0 || origH <= maxH;
            if (widthAlreadySmaller && heightAlreadySmaller)
            {
                return (origW, origH);
            }

            if (maintainAspect)
            {
                double ratioW = maxW > 0 ? (double)maxW / origW : double.MaxValue;
                double ratioH = maxH > 0 ? (double)maxH / origH : double.MaxValue;
                double ratio = Math.Min(ratioW, ratioH);

                if (ratio >= 1.0)
                {
                    return (origW, origH);
                }

                int newW = Math.Max(1, (int)Math.Round(origW * ratio));
                int newH = Math.Max(1, (int)Math.Round(origH * ratio));
                return (newW, newH);
            }
            else
            {
                int targetW = (maxW > 0 && maxW < origW) ? maxW : origW;
                int targetH = (maxH > 0 && maxH < origH) ? maxH : origH;
                return (targetW, targetH);
            }
        }

        public static ImageResizeResult ResizeAndOverwrite(
            string filePath,
            int maxW,
            int maxH,
            bool maintainAspect,
            int quality,
            string formatMode = "original")
        {
            var result = new ImageResizeResult
            {
                FilePath = filePath
            };

            try
            {
                var fileInfo = new FileInfo(filePath);
                if (!fileInfo.Exists)
                {
                    result.ErrorMessage = "Tệp không tồn tại";
                    return result;
                }
                result.OldSize = fileInfo.Length;

                var inspect = InspectImage(filePath);
                if (!inspect.IsValid)
                {
                    result.ErrorMessage = inspect.Error ?? "Không thể đọc thông tin ảnh";
                    return result;
                }

                result.OldWidth = inspect.Width;
                result.OldHeight = inspect.Height;

                var (newW, newH) = CalculateNewDimensions(inspect.Width, inspect.Height, maxW, maxH, maintainAspect);
                result.NewWidth = newW;
                result.NewHeight = newH;

                string origExt = Path.GetExtension(filePath).ToLowerInvariant();
                string outputExt = formatMode.ToLowerInvariant() switch
                {
                    "jpeg" or "jpg" => ".jpg",
                    "png" => ".png",
                    "bmp" => ".bmp",
                    _ => origExt
                };

                // BẢO VỆ 1: Kích thước ban đầu đã nhỏ hơn hoặc bằng mục tiêu và giữ nguyên định dạng
                bool isSameFormat = string.Equals(origExt, outputExt, StringComparison.OrdinalIgnoreCase);
                if (newW == inspect.Width && newH == inspect.Height && isSameFormat)
                {
                    result.Skipped = true;
                    result.SkipReason = "Kích thước ban đầu đã nhỏ hơn kích thước được chọn, đã tự động giữ nguyên";
                    result.NewSize = result.OldSize;
                    result.Success = true;
                    return result;
                }

                // Tệp tạm an toàn: ghi ra tệp tạm cùng thư mục để đảm bảo cùng phân vùng ổ đĩa cho thao tác Move nguyên tử (atomic)
                string dir = Path.GetDirectoryName(filePath) ?? "";
                string baseName = Path.GetFileNameWithoutExtension(filePath);
                string tempPath = Path.Combine(dir, $"{baseName}.tmp_resize_{Guid.NewGuid():N}{outputExt}");

                try
                {
                    // Đọc và resize ảnh bằng WIC
                    BitmapSource sourceBitmap;
                    using (var readStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                    {
                        var decoder = BitmapDecoder.Create(readStream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                        var frame = decoder.Frames[0];

                        if (newW != frame.PixelWidth || newH != frame.PixelHeight)
                        {
                            double scaleX = (double)newW / frame.PixelWidth;
                            double scaleY = (double)newH / frame.PixelHeight;
                            var scale = new ScaleTransform(scaleX, scaleY);
                            var transformed = new TransformedBitmap(frame, scale);
                            transformed.Freeze();
                            sourceBitmap = transformed;
                        }
                        else
                        {
                            sourceBitmap = frame;
                        }

                        // Chọn Encoder phù hợp
                        BitmapEncoder encoder = outputExt switch
                        {
                            ".jpg" or ".jpeg" => new JpegBitmapEncoder { QualityLevel = Math.Clamp(quality, 1, 100) },
                            ".png" => new PngBitmapEncoder(),
                            ".bmp" => new BmpBitmapEncoder(),
                            ".tif" or ".tiff" => new TiffBitmapEncoder(),
                            ".gif" => new GifBitmapEncoder(),
                            _ => new JpegBitmapEncoder { QualityLevel = Math.Clamp(quality, 1, 100) }
                        };

                        encoder.Frames.Add(BitmapFrame.Create(sourceBitmap));

                        using (var outStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            encoder.Save(outStream);
                        }
                    }

                    var tempInfo = new FileInfo(tempPath);
                    long newSize = tempInfo.Length;
                    result.NewSize = newSize;

                    // BẢO VỆ 2: Kiểm tra dung lượng sau nén
                    // Nếu dung lượng nén mới lớn hơn hoặc bằng dung lượng gốc (khi cùng định dạng) -> Giữ nguyên ảnh gốc
                    if (newSize >= result.OldSize && isSameFormat)
                    {
                        if (File.Exists(tempPath)) File.Delete(tempPath);
                        result.Skipped = true;
                        result.SkipReason = "Dung lượng nén mới lớn hơn ảnh gốc, đã tự động giữ nguyên bản gốc tối ưu hơn";
                        result.NewSize = result.OldSize;
                        result.Success = true;
                        return result;
                    }

                    // GHI ĐÈ NGUYÊN TỬ (Atomic overwrite)
                    if (isSameFormat)
                    {
                        File.Move(tempPath, filePath, overwrite: true);
                    }
                    else
                    {
                        // Nếu đổi định dạng (vd: png -> jpg), đổi tên tệp đích và xóa tệp cũ
                        string targetPath = Path.Combine(dir, $"{baseName}{outputExt}");
                        File.Move(tempPath, targetPath, overwrite: true);
                        if (!string.Equals(targetPath, filePath, StringComparison.OrdinalIgnoreCase))
                        {
                            File.Delete(filePath);
                        }
                        result.FilePath = targetPath;
                    }

                    result.Success = true;
                }
                catch
                {
                    if (File.Exists(tempPath))
                    {
                        try { File.Delete(tempPath); } catch { }
                    }
                    throw;
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        public static string FormatFileSize(long bytes)
        {
            if (bytes < 1024) return $"{bytes} B";
            double kb = bytes / 1024.0;
            if (kb < 1024) return $"{kb:F1} KB";
            double mb = kb / 1024.0;
            if (mb < 1024) return $"{mb:F1} MB";
            double gb = mb / 1024.0;
            return $"{gb:F2} GB";
        }
    }
}
