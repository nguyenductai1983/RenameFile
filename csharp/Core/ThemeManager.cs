using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Win32;

namespace CSharpFileRenamer.Core
{
    public enum AppThemeMode
    {
        System,
        Dark,
        Light
    }

    public static class ThemeManager
    {
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

        public static bool IsWindowsDarkTheme()
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                var value = key?.GetValue("AppsUseLightTheme");
                if (value is int intValue)
                {
                    return intValue == 0;
                }
            }
            catch { }
            return true; // Mặc định là Dark Theme nếu không đọc được
        }

        public static void ApplyTheme(bool isDark, Window? window = null)
        {
            var res = Application.Current.Resources;

            if (isDark)
            {
                res["ThemeBgWindow"] = new SolidColorBrush(Color.FromRgb(5, 7, 13));       // Nền cửa sổ Deep Dark (#05070D)
                res["ThemeBgHeader"] = new SolidColorBrush(Color.FromRgb(10, 13, 22));     // Thanh Header (#0A0D16)
                res["ThemeBgSubHeader"] = new SolidColorBrush(Color.FromRgb(7, 10, 18));   // Thanh Sub-header (#070A12)
                res["ThemeBgSidebar"] = new SolidColorBrush(Color.FromRgb(7, 10, 18));     // Sidebar bên trái (#070A12)
                res["ThemeBgMainContent"] = new SolidColorBrush(Color.FromRgb(5, 7, 13));  // Khu vực làm việc chính (#05070D)
                res["ThemeBgCard"] = new SolidColorBrush(Color.FromRgb(13, 17, 28));       // Thẻ Card (#0D111C)
                res["ThemeBgCardAlt"] = new SolidColorBrush(Color.FromRgb(18, 24, 38));    // Thẻ Card phụ (#121826)
                res["ThemeBgInput"] = new SolidColorBrush(Color.FromRgb(3, 5, 10));        // Ô nhập liệu đen tuyền (#03050A)
                res["ThemeBgFooter"] = new SolidColorBrush(Color.FromRgb(5, 7, 13));       // Thanh Status bar dưới cùng (#05070D)
                res["ThemeBorder"] = new SolidColorBrush(Color.FromRgb(26, 34, 50));       // Đường viền tinh tế (#1A2232)
                res["ThemeBorderStrong"] = new SolidColorBrush(Color.FromRgb(42, 54, 76)); // Viền nhấn (#2A364C)
                res["ThemeTextPrimary"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeTextSecondary"] = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                res["ThemeTextMuted"] = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                res["ThemeGridRowBg"] = new SolidColorBrush(Color.FromRgb(10, 13, 22));    // Dòng bảng 1 (#0A0D16)
                res["ThemeGridRowAltBg"] = new SolidColorBrush(Color.FromRgb(14, 18, 30)); // Dòng bảng xen kẽ 2 (#0E121E)
                res["ThemeGridHeaderBg"] = new SolidColorBrush(Color.FromRgb(18, 24, 38)); // Tiêu đề bảng (#121826)
                res["ThemeGridLines"] = new SolidColorBrush(Color.FromRgb(22, 29, 44));
                res["ThemeGridOverlay"] = new SolidColorBrush(Color.FromArgb(235, 5, 7, 13));
                res["ThemeTabActiveBg"] = new SolidColorBrush(Color.FromRgb(24, 32, 50));
                res["ThemeTabInactiveBg"] = Brushes.Transparent;
                res["ThemeAccent"] = new SolidColorBrush(Color.FromRgb(99, 102, 241));
                res["ThemeAccentHover"] = new SolidColorBrush(Color.FromRgb(79, 70, 229));
                res["ThemeAccentText"] = new SolidColorBrush(Colors.White);
                res["ThemeCardHover"] = new SolidColorBrush(Color.FromRgb(22, 30, 46));
                res["ThemeBadgeBg"] = new SolidColorBrush(Color.FromRgb(24, 21, 62));
                res["ThemeBadgeBorder"] = new SolidColorBrush(Color.FromRgb(67, 56, 202));
                res["ThemeBadgeText"] = new SolidColorBrush(Color.FromRgb(165, 180, 252));
            }
            else
            {
                res["ThemeBgWindow"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeBgHeader"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgSubHeader"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeBgSidebar"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgMainContent"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeBgCard"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgCardAlt"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeBgInput"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgFooter"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeBorder"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeBorderStrong"] = new SolidColorBrush(Color.FromRgb(203, 213, 225));
                res["ThemeTextPrimary"] = new SolidColorBrush(Color.FromRgb(15, 23, 42));
                res["ThemeTextSecondary"] = new SolidColorBrush(Color.FromRgb(71, 85, 105));
                res["ThemeTextMuted"] = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                res["ThemeGridRowBg"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeGridRowAltBg"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeGridHeaderBg"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeGridLines"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeGridOverlay"] = new SolidColorBrush(Color.FromArgb(230, 248, 250, 252));
                res["ThemeTabActiveBg"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeTabInactiveBg"] = Brushes.Transparent;
                res["ThemeAccent"] = new SolidColorBrush(Color.FromRgb(79, 70, 229));
                res["ThemeAccentHover"] = new SolidColorBrush(Color.FromRgb(67, 56, 202));
                res["ThemeAccentText"] = new SolidColorBrush(Colors.White);
                res["ThemeCardHover"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeBadgeBg"] = new SolidColorBrush(Color.FromRgb(238, 242, 255));
                res["ThemeBadgeBorder"] = new SolidColorBrush(Color.FromRgb(199, 210, 254));
                res["ThemeBadgeText"] = new SolidColorBrush(Color.FromRgb(67, 56, 202));
            }

            if (window != null)
            {
                try
                {
                    var hwnd = new WindowInteropHelper(window).Handle;
                    if (hwnd != IntPtr.Zero)
                    {
                        int darkMode = isDark ? 1 : 0;
                        DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
                    }
                }
                catch { }
            }
        }
    }
}
