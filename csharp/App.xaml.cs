using System.Diagnostics;
using System.Windows;
using CSharpFileRenamer.Core;

namespace CSharpFileRenamer
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            if (e.Args.Contains("--test"))
            {
                RunSelfTests();
                Shutdown(0);
                return;
            }

            base.OnStartup(e);
        }

        private static void RunSelfTests()
        {
            Console.WriteLine("==================================================");
            Console.WriteLine("  RENAME FILE VIET (C# .NET 11) SELF-TEST SUITE  ");
            Console.WriteLine("==================================================");

            int passed = 0;
            int failed = 0;

            void AssertEqual<T>(string testName, T expected, T actual)
            {
                if (Equals(expected, actual))
                {
                    Console.WriteLine($"[PASS] {testName}");
                    passed++;
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"[FAIL] {testName} - Expected: {expected}, Actual: {actual}");
                    Console.ResetColor();
                    failed++;
                }
            }

            // Test 1: BẢO VỆ ĐỘ PHÂN GIẢI - Ảnh nhỏ hơn mục tiêu (800x600 vs 1920x1080)
            var (w1, h1) = ImageResizer.CalculateNewDimensions(800, 600, 1920, 1080, true);
            AssertEqual("Safeguard: 800x600 <= 1920x1080 (Width)", 800, w1);
            AssertEqual("Safeguard: 800x600 <= 1920x1080 (Height)", 600, h1);

            // Test 2: BẢO VỆ ĐỘ PHÂN GIẢI - Ảnh bằng mục tiêu (1920x1080 vs 1920x1080)
            var (w2, h2) = ImageResizer.CalculateNewDimensions(1920, 1080, 1920, 1080, true);
            AssertEqual("Safeguard: Exact 1920x1080 (Width)", 1920, w2);
            AssertEqual("Safeguard: Exact 1920x1080 (Height)", 1080, h2);

            // Test 3: Nén 4K -> FHD giữ tỷ lệ
            var (w3, h3) = ImageResizer.CalculateNewDimensions(3840, 2160, 1920, 1080, true);
            AssertEqual("Resize 4K to FHD aspect (Width)", 1920, w3);
            AssertEqual("Resize 4K to FHD aspect (Height)", 1080, h3);

            // Test 4: Giới hạn theo chiều rộng
            var (w4, h4) = ImageResizer.CalculateNewDimensions(2000, 1000, 1920, 1080, true);
            AssertEqual("Aspect ratio bounded by width (Width)", 1920, w4);
            AssertEqual("Aspect ratio bounded by width (Height)", 960, h4);

            // Test 5: Giới hạn theo chiều cao (ảnh dọc)
            var (w5, h5) = ImageResizer.CalculateNewDimensions(1000, 2000, 1920, 1080, true);
            AssertEqual("Aspect ratio bounded by height (Width)", 540, w5);
            AssertEqual("Aspect ratio bounded by height (Height)", 1080, h5);

            // Test 6: Không giữ tỷ lệ (force stretch)
            var (w6, h6) = ImageResizer.CalculateNewDimensions(2000, 2000, 1920, 1080, false);
            AssertEqual("No aspect ratio (Width)", 1920, w6);
            AssertEqual("No aspect ratio (Height)", 1080, h6);

            // Test 7: Định dạng ảnh hỗ trợ
            AssertEqual("Supported: .jpg", true, ImageResizer.IsSupportedImage("photo.jpg"));
            AssertEqual("Supported: .JPEG", true, ImageResizer.IsSupportedImage("photo.JPEG"));
            AssertEqual("Supported: .png", true, ImageResizer.IsSupportedImage("photo.png"));
            AssertEqual("Supported: .webp", true, ImageResizer.IsSupportedImage("photo.webp"));
            AssertEqual("Supported: .bmp", true, ImageResizer.IsSupportedImage("photo.bmp"));
            AssertEqual("Unsupported: .txt", false, ImageResizer.IsSupportedImage("photo.txt"));
            AssertEqual("Unsupported: .exe", false, ImageResizer.IsSupportedImage("app.exe"));

            // Test 8: Định dạng kích thước tệp (FormatFileSize)
            AssertEqual("Format: 500 B", "500 B", ImageResizer.FormatFileSize(500));
            AssertEqual("Format: 2.0 KB", "2.0 KB", ImageResizer.FormatFileSize(2048));
            AssertEqual("Format: 2.0 MB", "2.0 MB", ImageResizer.FormatFileSize(2097152));

            Console.WriteLine("--------------------------------------------------");
            Console.WriteLine($"RESULT: {passed} passed, {failed} failed.");
            Console.WriteLine("==================================================");

            if (failed > 0)
            {
                Environment.Exit(1);
            }
        }
    }
}
