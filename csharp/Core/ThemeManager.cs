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
                res["ThemeBgWindow"] = new SolidColorBrush(Color.FromRgb(11, 15, 25));
                res["ThemeBgHeader"] = new SolidColorBrush(Color.FromRgb(15, 23, 42));
                res["ThemeBgSubHeader"] = new SolidColorBrush(Color.FromRgb(12, 19, 34));
                res["ThemeBgSidebar"] = new SolidColorBrush(Color.FromRgb(11, 15, 25));
                res["ThemeBgMainContent"] = new SolidColorBrush(Color.FromRgb(9, 13, 22));
                res["ThemeBgCard"] = new SolidColorBrush(Color.FromRgb(15, 23, 42));
                res["ThemeBgCardAlt"] = new SolidColorBrush(Color.FromRgb(19, 29, 49));
                res["ThemeBgInput"] = new SolidColorBrush(Color.FromRgb(2, 6, 23));
                res["ThemeBgFooter"] = new SolidColorBrush(Color.FromRgb(2, 6, 23));
                res["ThemeBorder"] = new SolidColorBrush(Color.FromRgb(30, 41, 59));
                res["ThemeBorderStrong"] = new SolidColorBrush(Color.FromRgb(51, 65, 85));
                res["ThemeTextPrimary"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeTextSecondary"] = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                res["ThemeTextMuted"] = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                res["ThemeGridRowBg"] = new SolidColorBrush(Color.FromRgb(15, 23, 42));
                res["ThemeGridRowAltBg"] = new SolidColorBrush(Color.FromRgb(19, 29, 49));
                res["ThemeGridHeaderBg"] = new SolidColorBrush(Color.FromRgb(30, 41, 59));
                res["ThemeGridLines"] = new SolidColorBrush(Color.FromRgb(30, 41, 59));
                res["ThemeGridOverlay"] = new SolidColorBrush(Color.FromArgb(238, 9, 13, 26));
                res["ThemeTabActiveBg"] = new SolidColorBrush(Color.FromRgb(30, 41, 59));
                res["ThemeTabInactiveBg"] = Brushes.Transparent;
            }
            else
            {
                res["ThemeBgWindow"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeBgHeader"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgSubHeader"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeBgSidebar"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgMainContent"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeBgCard"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgCardAlt"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeBgInput"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBgFooter"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeBorder"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeBorderStrong"] = new SolidColorBrush(Color.FromRgb(203, 213, 225));
                res["ThemeTextPrimary"] = new SolidColorBrush(Color.FromRgb(15, 23, 42));
                res["ThemeTextSecondary"] = new SolidColorBrush(Color.FromRgb(71, 85, 105));
                res["ThemeTextMuted"] = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                res["ThemeGridRowBg"] = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                res["ThemeGridRowAltBg"] = new SolidColorBrush(Color.FromRgb(248, 250, 252));
                res["ThemeGridHeaderBg"] = new SolidColorBrush(Color.FromRgb(241, 245, 249));
                res["ThemeGridLines"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeGridOverlay"] = new SolidColorBrush(Color.FromArgb(238, 255, 255, 255));
                res["ThemeTabActiveBg"] = new SolidColorBrush(Color.FromRgb(226, 232, 240));
                res["ThemeTabInactiveBg"] = Brushes.Transparent;
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
