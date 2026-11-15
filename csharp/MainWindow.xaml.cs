using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using CSharpFileRenamer.Core;
using CSharpFileRenamer.Core.Rules;
using Microsoft.Win32;

namespace CSharpFileRenamer
{
    public partial class MainWindow : Window
    {
        private readonly ObservableCollection<RenameItem> _items = new();
        private readonly List<RenameItem> _allResults = new();
        private readonly List<string> _loadedFiles = new();
        private readonly TransactionManager _transactionManager = new();

        // Image Resizer State
        private readonly ObservableCollection<ImageItem> _imageItems = new();
        private readonly List<ImageItem> _allImageResults = new();
        private CancellationTokenSource? _imageCts;

        private string _currentFolderPath = "";
        private bool _isRenamed = false;
        private bool _isInitializing = true;
        private CancellationTokenSource? _scanCts;
        private bool _isScanning = false;
        private AppThemeMode _currentThemeMode = AppThemeMode.System;

        public MainWindow()
        {
            InitializeComponent();
            TxtBenchThreads.Text = $"{Environment.ProcessorCount} Threads";
            _isInitializing = false;

            // Đồng bộ theme hệ điều hành Windows ban đầu
            ThemeManager.ApplyTheme(ThemeManager.IsWindowsDarkTheme(), this);
            SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
            Closed += (s, e) => SystemEvents.UserPreferenceChanged -= OnUserPreferenceChanged;

            // Gán ItemsSource cho DataGrid ảnh
            GridImages.ItemsSource = _imageItems;
        }

        private void OnUserPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
        {
            if (e.Category == UserPreferenceCategory.General || e.Category == UserPreferenceCategory.VisualStyle)
            {
                Dispatcher.Invoke(() =>
                {
                    if (_currentThemeMode == AppThemeMode.System)
                    {
                        ThemeManager.ApplyTheme(ThemeManager.IsWindowsDarkTheme(), this);
                    }
                });
            }
        }

        private void BtnThemeToggle_Click(object sender, RoutedEventArgs e)
        {
            switch (_currentThemeMode)
            {
                case AppThemeMode.System:
                    _currentThemeMode = AppThemeMode.Dark;
                    BtnThemeToggle.Content = "🌙 Tối";
                    ThemeManager.ApplyTheme(true, this);
                    break;
                case AppThemeMode.Dark:
                    _currentThemeMode = AppThemeMode.Light;
                    BtnThemeToggle.Content = "☀️ Sáng";
                    ThemeManager.ApplyTheme(false, this);
                    break;
                case AppThemeMode.Light:
                    _currentThemeMode = AppThemeMode.System;
                    BtnThemeToggle.Content = "🌓 Tự động";
                    ThemeManager.ApplyTheme(ThemeManager.IsWindowsDarkTheme(), this);
                    break;
            }
        }

        #region Mode Switcher (Đổi Tên Tệp vs Giảm Dung Lượng Ảnh)

        private void OnModeChanged(object sender, RoutedEventArgs e)
        {
            if (_isInitializing) return;

            bool isImageMode = RadModeImage?.IsChecked == true;

            if (ViewRename != null) ViewRename.Visibility = isImageMode ? Visibility.Collapsed : Visibility.Visible;
            if (ViewImageResizer != null) ViewImageResizer.Visibility = isImageMode ? Visibility.Visible : Visibility.Collapsed;
            if (PanelRenameActions != null) PanelRenameActions.Visibility = isImageMode ? Visibility.Collapsed : Visibility.Visible;

            if (isImageMode)
            {
                UpdateImageSelectionCount();
            }
            else
            {
                if (TxtItemCount != null)
                {
                    TxtItemCount.Text = $"Hiển thị: {_allResults.Count:N0} tệp tin";
                }
            }
        }

        #endregion

        #region Scan & Load Files

        private void SetGridLoading(bool isLoading, string title = "Đang xử lý & tải hiển thị danh sách...", string desc = "Vui lòng chờ trong giây lát...")
        {
            if (PanelGridLoading == null) return;
            PanelGridLoading.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            if (TxtGridLoadingTitle != null) TxtGridLoadingTitle.Text = title;
            if (TxtGridLoadingDesc != null) TxtGridLoadingDesc.Text = desc;
            if (TxtGridSkipped != null && !isLoading) TxtGridSkipped.Text = "";
            if (BtnCancelScan != null) BtnCancelScan.Visibility = _isScanning ? Visibility.Visible : Visibility.Collapsed;
        }

        private void BtnCancelScan_Click(object sender, RoutedEventArgs e)
        {
            _scanCts?.Cancel();
            SetGridLoading(true, "Đang gửi yêu cầu dừng quét...", "Hệ thống đang hoàn tất dữ liệu đã tìm thấy...");
        }

        private async Task RescanCurrentFolderAsync()
        {
            if (string.IsNullOrEmpty(_currentFolderPath)) return;

            _scanCts?.Cancel();
            _scanCts = new CancellationTokenSource();
            var token = _scanCts.Token;

            _isRenamed = false;
            BtnApply.IsEnabled = false;
            BtnApply.Content = "▶ Đổi Tên";

            _loadedFiles.Clear();
            _allResults.Clear();
            GridFiles.ItemsSource = null;
            TxtItemCount.Text = "Đang quét thư mục...";
            _isScanning = true;
            SetGridLoading(true, "Đang quét thư mục...", $"Duyệt các tệp tin trong: {_currentFolderPath}");

            var recursive = ChkRecursive.IsChecked == true;
            var includeHidden = ChkHidden.IsChecked == true;
            var includeFolders = ChkFolders.IsChecked == true;

            var progress = new Progress<ScanProgressInfo>(info =>
            {
                if (TxtGridLoadingTitle != null) TxtGridLoadingTitle.Text = $"Đang quét: {info.Count:N0} tệp (Duyệt {info.DirCount:N0} thư mục)";
                if (TxtGridLoadingDesc != null) TxtGridLoadingDesc.Text = $"📂 {info.CurrentDirectory}";
                if (TxtGridSkipped != null)
                {
                    TxtGridSkipped.Text = info.SkippedCount > 0 ? $"⚠️ Đã bỏ qua {info.SkippedCount:N0} thư mục bảo vệ/hệ thống" : "";
                    TxtGridSkipped.ToolTip = info.LastSkippedPath;
                }
            });

            try
            {
                var scanned = await DirectoryScanner.ScanAsync(_currentFolderPath, recursive, includeHidden, includeFolders, progress, token);

                _loadedFiles.Clear();
                _loadedFiles.AddRange(scanned);

                _isScanning = false;
                SetGridLoading(true, "Đang xử lý & tải hiển thị danh sách...", $"Đã quét được {scanned.Count:N0} mục. Đang áp dụng quy tắc đổi tên...");
                await RecomputePreviewAsync();
                await LoadAndInspectImagesAsync();

                if (token.IsCancellationRequested)
                {
                    ShowBanner($"Đã dừng quét! Đã nạp {scanned.Count:N0} tệp tin đã tìm thấy trước khi dừng.");
                }
                else if (scanned.Count > 0)
                {
                    ShowBanner($"Đã quét được {scanned.Count:N0} mục ({(recursive ? "Bao gồm thư mục con" : "Chỉ thư mục hiện tại")}{(includeFolders ? ", gồm đổi tên folder" : "")}{(includeHidden ? ", gồm file ẩn" : "")})");
                }
                else
                {
                    ShowBanner("Thư mục trống hoặc không chứa file hợp lệ");
                }
            }
            catch (OperationCanceledException)
            {
                ShowBanner($"Đã dừng quét! Đã nạp {_loadedFiles.Count:N0} tệp tin.");
            }
            catch (Exception ex)
            {
                ShowBanner($"Lỗi quét thư mục: {ex.Message}");
            }
            finally
            {
                _isScanning = false;
                SetGridLoading(false);
                BtnApply.IsEnabled = _loadedFiles.Count > 0;
            }
        }

        private async void BtnSelectFiles_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Multiselect = true,
                Title = "Chọn các tập tin cần xử lý"
            };

            if (dialog.ShowDialog() == true && dialog.FileNames.Length > 0)
            {
                _isRenamed = false;
                BtnApply.IsEnabled = true;
                BtnApply.Content = "▶ Đổi Tên";

                _currentFolderPath = "";
                TxtCurrentFolder.Text = $"(Đang chọn {dialog.FileNames.Length} tệp tin rời rạc)";
                BtnOpenExplorer.Visibility = Visibility.Collapsed;
                BtnCloseFolder.Visibility = Visibility.Collapsed;

                _loadedFiles.Clear();
                _allResults.Clear();
                GridFiles.ItemsSource = null;
                TxtSearch.Text = "";
                if (RadFilterAll != null) RadFilterAll.IsChecked = true;

                SetGridLoading(true, "Đang nạp tệp tin...", $"Đang xử lý {dialog.FileNames.Length:N0} tệp tin đã chọn...");

                try
                {
                    _loadedFiles.AddRange(dialog.FileNames);
                    await RecomputePreviewAsync();
                    await LoadAndInspectImagesAsync();
                    ShowBanner($"Đã nạp thành công {_loadedFiles.Count:N0} tệp tin");
                }
                finally
                {
                    SetGridLoading(false);
                }
            }
        }

        private async void BtnScanFolder_Click(object sender, RoutedEventArgs e)
        {
            if (_isScanning) return;

            var dialog = new OpenFolderDialog
            {
                Title = "Chọn thư mục cần quét tệp tin"
            };

            if (dialog.ShowDialog() == true && !string.IsNullOrEmpty(dialog.FolderName))
            {
                _currentFolderPath = dialog.FolderName;
                TxtCurrentFolder.Text = _currentFolderPath;
                BtnOpenExplorer.Visibility = Visibility.Visible;
                BtnCloseFolder.Visibility = Visibility.Visible;

                _loadedFiles.Clear();
                _allResults.Clear();
                GridFiles.ItemsSource = null;
                TxtSearch.Text = "";
                if (RadFilterAll != null) RadFilterAll.IsChecked = true;

                await RescanCurrentFolderAsync();
            }
        }

        private async void OnOptionChanged(object? sender, RoutedEventArgs? e)
        {
            if (_isInitializing) return;

            if (!string.IsNullOrEmpty(_currentFolderPath))
            {
                await RescanCurrentFolderAsync();
            }
        }

        #endregion

        #region Image Resizer Engine & UI Logic

        private async Task LoadAndInspectImagesAsync()
        {
            var imageFiles = _loadedFiles.Where(ImageResizer.IsSupportedImage).ToList();

            _allImageResults.Clear();
            _imageItems.Clear();

            if (RadModeImage != null)
            {
                RadModeImage.Content = $"🖼️ Giảm Kích Thước Ảnh ({imageFiles.Count})";
            }

            if (imageFiles.Count == 0)
            {
                UpdateImageSelectionCount();
                return;
            }

            // Quét nhanh header ảnh đa luồng
            var inspected = await Task.Run(() =>
            {
                var list = new List<ImageItem>();
                int idx = 1;
                foreach (var path in imageFiles)
                {
                    var info = ImageResizer.InspectImage(path);
                    var item = new ImageItem
                    {
                        Index = idx++,
                        FilePath = path,
                        OriginalWidth = info.Width,
                        OriginalHeight = info.Height,
                        OriginalSize = info.FileSize,
                        IsSelected = true
                    };
                    list.Add(item);
                }
                return list;
            });

            _allImageResults.AddRange(inspected);
            RecomputeImageTargets();
            ApplyImageFilter();
        }

        private void RecomputeImageTargets()
        {
            if (_allImageResults.Count == 0) return;

            int.TryParse(TxtImgMaxWidth?.Text, out int maxW);
            int.TryParse(TxtImgMaxHeight?.Text, out int maxH);
            bool keepAspect = ChkImgKeepAspect?.IsChecked == true;

            foreach (var item in _allImageResults)
            {
                var (newW, newH) = ImageResizer.CalculateNewDimensions(item.OriginalWidth, item.OriginalHeight, maxW, maxH, keepAspect);
                item.TargetWidth = newW;
                item.TargetHeight = newH;
                item.IsAlreadySmaller = (maxW == 0 || item.OriginalWidth <= maxW) && (maxH == 0 || item.OriginalHeight <= maxH);
            }

            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void UpdateImageSelectionCount()
        {
            if (BtnExecuteOverwrite == null) return;

            int selected = _allImageResults.Count(it => it.IsSelected);
            int total = _allImageResults.Count;

            BtnExecuteOverwrite.Content = $"⚡ Tiến Hành Ghi Đè ({selected} ảnh)";
            BtnExecuteOverwrite.IsEnabled = selected > 0;

            if (RadModeImage?.IsChecked == true && TxtItemCount != null)
            {
                TxtItemCount.Text = $"Đang chọn: {selected:N0}/{total:N0} tệp ảnh";
            }
        }

        private void OnPresetChanged(object sender, RoutedEventArgs e)
        {
            if (_isInitializing || TxtImgMaxWidth == null || TxtImgMaxHeight == null) return;

            if (RadPreset4K?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "3840";
                TxtImgMaxHeight.Text = "2160";
            }
            else if (RadPreset2K?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "2560";
                TxtImgMaxHeight.Text = "1440";
            }
            else if (RadPresetFHD?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "1920";
                TxtImgMaxHeight.Text = "1080";
            }
            else if (RadPreset1360?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "1360";
                TxtImgMaxHeight.Text = "768";
            }
            else if (RadPresetHD?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "1280";
                TxtImgMaxHeight.Text = "720";
            }
            else if (RadPresetWeb?.IsChecked == true)
            {
                TxtImgMaxWidth.Text = "1024";
                TxtImgMaxHeight.Text = "768";
            }

            RecomputeImageTargets();
        }

        private void OnImageOptionChanged(object sender, RoutedEventArgs e)
        {
            if (_isInitializing) return;
            RecomputeImageTargets();
        }

        private void OnImageQualityChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_isInitializing || TxtImgQualityVal == null) return;
            TxtImgQualityVal.Text = $"{(int)SliderImgQuality.Value}%";
        }

        private void OnImgSearchChanged(object sender, TextChangedEventArgs e)
        {
            ApplyImageFilter();
        }

        private void ApplyImageFilter()
        {
            if (_isInitializing || GridImages == null) return;

            var query = TxtImgSearch?.Text?.Trim().ToLowerInvariant() ?? "";

            var filtered = _allImageResults.Where(item =>
            {
                if (!string.IsNullOrEmpty(query))
                {
                    return item.FileName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                           item.FilePath.Contains(query, StringComparison.OrdinalIgnoreCase);
                }
                return true;
            }).ToList();

            _imageItems.Clear();
            foreach (var it in filtered)
            {
                _imageItems.Add(it);
            }

            UpdateImageSelectionCount();
        }

        private void BtnImgSelectAll_Click(object sender, RoutedEventArgs e)
        {
            foreach (var it in _allImageResults) it.IsSelected = true;
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void BtnImgDeselectAll_Click(object sender, RoutedEventArgs e)
        {
            foreach (var it in _allImageResults) it.IsSelected = false;
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void BtnImgSelectLargeSize_Click(object sender, RoutedEventArgs e)
        {
            // Chọn ảnh > 2 MB (2 * 1024 * 1024 bytes)
            const long twoMb = 2 * 1024 * 1024;
            foreach (var it in _allImageResults)
            {
                it.IsSelected = it.OriginalSize > twoMb;
            }
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void BtnImgSelectLargeDim_Click(object sender, RoutedEventArgs e)
        {
            // Chọn ảnh > 1920 px (chiều rộng hoặc chiều cao)
            foreach (var it in _allImageResults)
            {
                it.IsSelected = it.OriginalWidth > 1920 || it.OriginalHeight > 1920;
            }
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void BtnImgSelectOverTarget_Click(object sender, RoutedEventArgs e)
        {
            // BẢO VỆ ĐỘ PHÂN GIẢI: Chỉ chọn các ảnh có kích thước thực sự lớn hơn kích thước mục tiêu
            foreach (var it in _allImageResults)
            {
                it.IsSelected = !it.IsAlreadySmaller;
            }
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void OnImgHeaderCheckAll(object sender, RoutedEventArgs e)
        {
            foreach (var it in _allImageResults) it.IsSelected = true;
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void OnImgHeaderUncheckAll(object sender, RoutedEventArgs e)
        {
            foreach (var it in _allImageResults) it.IsSelected = false;
            GridImages?.Items.Refresh();
            UpdateImageSelectionCount();
        }

        private void OnImgItemSelectionChanged(object sender, RoutedEventArgs e)
        {
            UpdateImageSelectionCount();
        }

        private void BtnOpenImageInExplorer_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is ImageItem item)
            {
                if (File.Exists(item.FilePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "explorer.exe",
                        Arguments = $"/select,\"{item.FilePath}\"",
                        UseShellExecute = true
                    });
                }
            }
        }

        #endregion

        #region Overwrite Confirmation & Execution

        private void BtnExecuteOverwrite_Click(object sender, RoutedEventArgs e)
        {
            var selectedItems = _allImageResults.Where(it => it.IsSelected).ToList();
            if (selectedItems.Count == 0)
            {
                ShowBanner("Vui lòng tích chọn ít nhất 1 tệp ảnh để thực hiện ghi đè");
                return;
            }

            int alreadySmallerCount = selectedItems.Count(it => it.IsAlreadySmaller);

            int.TryParse(TxtImgMaxWidth?.Text, out int maxW);
            int.TryParse(TxtImgMaxHeight?.Text, out int maxH);
            int quality = (int)(SliderImgQuality?.Value ?? 80);

            string format = "Giữ định dạng gốc";
            if (RadImgFmtJpeg?.IsChecked == true) format = "Chuyển sang JPEG (.jpg)";
            else if (RadImgFmtPng?.IsChecked == true) format = "Chuyển sang PNG (.png)";

            // Cập nhật thông tin tóm tắt trên hộp thoại xác nhận
            TxtModalCount.Text = $"{selectedItems.Count} tệp ảnh";
            TxtModalSkipped.Text = alreadySmallerCount > 0 
                ? $"{alreadySmallerCount} tệp sẽ tự động giữ nguyên (do đã nhỏ hơn)" 
                : "0 tệp (tất cả đều lớn hơn mục tiêu)";
            TxtModalTargetDim.Text = $"Max {maxW} × {maxH} px";
            TxtModalQuality.Text = $"{quality}%";
            TxtModalFormat.Text = format;

            ChkAgreeOverwrite.IsChecked = false;
            BtnConfirmOverwriteExecute.IsEnabled = false;

            ModalConfirmOverwrite.Visibility = Visibility.Visible;
        }

        private void OnAgreeOverwriteChanged(object sender, RoutedEventArgs e)
        {
            BtnConfirmOverwriteExecute.IsEnabled = ChkAgreeOverwrite.IsChecked == true;
        }

        private void BtnCancelOverwrite_Click(object sender, RoutedEventArgs e)
        {
            ModalConfirmOverwrite.Visibility = Visibility.Collapsed;
        }

        private async void BtnConfirmOverwriteExecute_Click(object sender, RoutedEventArgs e)
        {
            ModalConfirmOverwrite.Visibility = Visibility.Collapsed;

            var itemsToProcess = _allImageResults.Where(it => it.IsSelected).ToList();
            if (itemsToProcess.Count == 0) return;

            int.TryParse(TxtImgMaxWidth?.Text, out int maxW);
            int.TryParse(TxtImgMaxHeight?.Text, out int maxH);
            bool keepAspect = ChkImgKeepAspect?.IsChecked == true;
            int quality = (int)(SliderImgQuality?.Value ?? 80);

            string formatMode = "original";
            if (RadImgFmtJpeg?.IsChecked == true) formatMode = "jpeg";
            else if (RadImgFmtPng?.IsChecked == true) formatMode = "png";

            _imageCts = new CancellationTokenSource();
            var token = _imageCts.Token;

            PanelImageProgress.Visibility = Visibility.Visible;
            ProgressImgBar.Value = 0;
            ProgressImgBar.Maximum = itemsToProcess.Count;

            int processedCount = 0;
            int successCount = 0;
            int skippedSmallerCount = 0;
            int skippedLargerCount = 0;
            int errorCount = 0;
            long totalSavedBytes = 0;

            var sw = Stopwatch.StartNew();

            await Task.Run(() =>
            {
                Parallel.ForEach(itemsToProcess, new ParallelOptions
                {
                    MaxDegreeOfParallelism = Environment.ProcessorCount,
                    CancellationToken = token
                },
                item =>
                {
                    if (token.IsCancellationRequested) return;

                    var res = ImageResizer.ResizeAndOverwrite(item.FilePath, maxW, maxH, keepAspect, quality, formatMode);

                    Interlocked.Increment(ref processedCount);

                    if (res.Success)
                    {
                        if (res.Skipped)
                        {
                            if (res.SkipReason?.Contains("nhỏ hơn") == true)
                            {
                                Interlocked.Increment(ref skippedSmallerCount);
                                item.Status = "skipped_smaller";
                            }
                            else
                            {
                                Interlocked.Increment(ref skippedLargerCount);
                                item.Status = "skipped_larger";
                            }
                            item.StatusNote = res.SkipReason;
                            item.NewSize = item.OriginalSize;
                        }
                        else
                        {
                            Interlocked.Increment(ref successCount);
                            item.Status = "success";
                            item.NewSize = res.NewSize;
                            item.FilePath = res.FilePath;
                            long saved = item.OriginalSize - res.NewSize;
                            if (saved > 0)
                            {
                                Interlocked.Add(ref totalSavedBytes, saved);
                            }
                        }
                    }
                    else
                    {
                        Interlocked.Increment(ref errorCount);
                        item.Status = "error";
                        item.StatusNote = res.ErrorMessage;
                    }

                    // Cập nhật tiến độ trên giao diện
                    Dispatcher.InvokeAsync(() =>
                    {
                        ProgressImgBar.Value = processedCount;
                        TxtImgProgressTitle.Text = $"Đang xử lý nén ảnh: {processedCount}/{itemsToProcess.Count} ({processedCount * 100 / itemsToProcess.Count}%)...";
                        TxtImgProgressFile.Text = item.FileName;
                    });
                });
            });

            sw.Stop();
            PanelImageProgress.Visibility = Visibility.Collapsed;
            GridImages?.Items.Refresh();

            var savedText = ImageResizer.FormatFileSize(totalSavedBytes);
            var report = $"Xử lý hoàn tất trong {sw.ElapsedMilliseconds} ms: Đã giảm {successCount} ảnh, tiết kiệm {savedText}!";
            if (skippedSmallerCount > 0) report += $" Tự động giữ nguyên {skippedSmallerCount} ảnh (đã nhỏ hơn).";
            if (skippedLargerCount > 0) report += $" Giữ nguyên {skippedLargerCount} ảnh (tránh phình dung lượng).";
            if (errorCount > 0) report += $" Có {errorCount} ảnh gặp lỗi.";

            ShowBanner(report);
        }

        private void BtnCancelImageResize_Click(object sender, RoutedEventArgs e)
        {
            _imageCts?.Cancel();
            TxtImgProgressTitle.Text = "Đang gửi tín hiệu dừng...";
        }

        #endregion

        #region Rename Engine & Existing Event Handlers

        private void OnTabChanged(object sender, RoutedEventArgs e)
        {
            if (_isInitializing) return;

            if (PanelClean != null) PanelClean.Visibility = TabClean?.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            if (PanelFind != null) PanelFind.Visibility = TabFind?.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            if (PanelNum != null) PanelNum.Visibility = TabNum?.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            if (PanelCase != null) PanelCase.Visibility = TabCase?.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        }

        private void OnSearchChanged(object sender, TextChangedEventArgs e)
        {
            if (_isInitializing) return;
            ApplyTableFilter();
        }

        private void OnFilterChanged(object sender, RoutedEventArgs e)
        {
            if (_isInitializing) return;
            ApplyTableFilter();
        }

        private void ApplyTableFilter()
        {
            if (_isInitializing || GridFiles == null) return;

            var query = TxtSearch?.Text?.Trim().ToLowerInvariant() ?? "";
            var isRenamedOnly = RadFilterRenamed?.IsChecked == true;
            var isUnchangedOnly = RadFilterUnchanged?.IsChecked == true;
            var isCollisionOnly = RadFilterCollision?.IsChecked == true;
            var isLongPathOnly = RadFilterLongPath?.IsChecked == true;

            var filtered = _allResults.Where(item =>
            {
                if (isRenamedOnly && !string.Equals(item.Status, "renamed", StringComparison.OrdinalIgnoreCase)) return false;
                if (isUnchangedOnly && !string.Equals(item.Status, "unchanged", StringComparison.OrdinalIgnoreCase)) return false;
                if (isCollisionOnly && !string.Equals(item.Status, "collision_resolved", StringComparison.OrdinalIgnoreCase)) return false;
                if (isLongPathOnly && !item.IsLongPath) return false;

                if (!string.IsNullOrEmpty(query))
                {
                    return (item.OriginalName != null && item.OriginalName.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                           (item.NewName != null && item.NewName.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                           (item.OriginalPath != null && item.OriginalPath.Contains(query, StringComparison.OrdinalIgnoreCase));
                }

                return true;
            }).ToList();

            GridFiles.ItemsSource = filtered;
            if (TxtItemCount != null && RadModeRename?.IsChecked == true)
            {
                TxtItemCount.Text = $"Hiển thị: {filtered.Count:N0}/{_allResults.Count:N0} tệp tin";
            }
        }

        private List<IRenameRule> BuildPipeline()
        {
            var pipeline = new List<IRenameRule>();

            // Tab 1: Chuẩn Hóa
            if (ChkVietnamese?.IsChecked == true)
            {
                pipeline.Add(new VietnameseCleanRule());
            }

            if (ChkSanitize?.IsChecked == true)
            {
                var replacement = TxtSanitizeReplacement?.Text ?? "_";
                pipeline.Add(new SanitizeFilenameRule(replacement));
            }

            if (ChkSpace?.IsChecked == true)
            {
                var action = SpaceAction.Collapse;
                if (RadSpaceTrim?.IsChecked == true) action = SpaceAction.Trim;
                else if (RadSpaceRemoveAll?.IsChecked == true) action = SpaceAction.RemoveAll;
                pipeline.Add(new SpaceRule(action));
            }

            if (ChkSlug?.IsChecked == true)
            {
                var sep = RadSlugUnderscore?.IsChecked == true ? "_" : "-";
                pipeline.Add(new WebSafeSlugRule(sep));
            }

            if (ChkTruncateLongPath?.IsChecked == true)
            {
                int.TryParse(TxtMaxPathLength?.Text, out var maxLen);
                if (maxLen <= 0) maxLen = 250;
                var useMiddle = RadTruncMiddle?.IsChecked == true;
                pipeline.Add(new SmartTruncatePathRule(maxLen, useMiddle));
            }

            // Tab 2: Tìm & Thay Thế
            if (ChkFindReplace?.IsChecked == true && !string.IsNullOrEmpty(TxtFind?.Text))
            {
                var replace = TxtReplace?.Text ?? "";
                var useRegex = ChkFindRegex?.IsChecked == true;
                var matchCase = ChkFindMatchCase?.IsChecked == true;
                pipeline.Add(new FindReplaceRule(TxtFind.Text, replace, useRegex, matchCase));
            }

            // Tab 3: Tiền tố / Hậu tố & Đánh số thứ tự
            if (ChkPrefixSuffix?.IsChecked == true && (!string.IsNullOrEmpty(TxtPrefix?.Text) || !string.IsNullOrEmpty(TxtSuffix?.Text)))
            {
                pipeline.Add(new PrefixSuffixRule(TxtPrefix?.Text ?? "", TxtSuffix?.Text ?? ""));
            }

            if (ChkNumbering?.IsChecked == true)
            {
                int.TryParse(TxtNumStart?.Text, out var start);
                int.TryParse(TxtNumStep?.Text, out var step);
                int.TryParse(TxtNumPad?.Text, out var pad);
                if (step <= 0) step = 1;
                if (pad <= 0) pad = 3;

                var pos = NumberingPosition.Suffix;
                if (RadNumPrefix?.IsChecked == true) pos = NumberingPosition.Prefix;
                else if (RadNumReplace?.IsChecked == true) pos = NumberingPosition.ReplaceAll;

                pipeline.Add(new NumberingRule(start, step, pad, pos, TxtNumSep?.Text ?? "_"));
            }

            // Tab 4: Kiểu chữ & Extension
            if (ChkCase?.IsChecked == true)
            {
                var caseType = CaseType.Title;
                if (RadCaseSentence?.IsChecked == true) caseType = CaseType.Sentence;
                else if (RadCaseUpper?.IsChecked == true) caseType = CaseType.Upper;
                else if (RadCaseLower?.IsChecked == true) caseType = CaseType.Lower;

                pipeline.Add(new CaseRule(caseType));
            }

            if (ChkChangeExt?.IsChecked == true && !string.IsNullOrWhiteSpace(TxtNewExt?.Text))
            {
                pipeline.Add(new ChangeExtensionRule(TxtNewExt.Text));
            }

            return pipeline;
        }

        private async void OnRuleChanged(object? sender, RoutedEventArgs? e)
        {
            if (_isInitializing) return;

            if (_isRenamed)
            {
                var currentPaths = _allResults.Select(it => it.TargetPath).ToList();
                _loadedFiles.Clear();
                _loadedFiles.AddRange(currentPaths);
                _isRenamed = false;
                BtnApply.IsEnabled = true;
                BtnApply.Content = "▶ Đổi Tên";
            }

            await RecomputePreviewAsync();
        }

        private async Task RecomputePreviewAsync()
        {
            if (_loadedFiles.Count == 0)
            {
                _allResults.Clear();
                GridFiles.ItemsSource = null;
                if (PanelEmptyState != null) PanelEmptyState.Visibility = Visibility.Visible;
                if (GridFiles != null) GridFiles.Visibility = Visibility.Collapsed;
                TxtItemCount.Text = "Sẵn sàng: 0 tệp tin";
                TxtBenchTime.Text = "0.00 ms";
                TxtBenchThroughput.Text = "0 tệp/giây";
                if (BannerLongPath != null) BannerLongPath.Visibility = Visibility.Collapsed;
                return;
            }

            if (PanelEmptyState != null) PanelEmptyState.Visibility = Visibility.Collapsed;
            if (GridFiles != null) GridFiles.Visibility = Visibility.Visible;

            var pipeline = BuildPipeline();
            var engine = new RenamerEngine(pipeline);
            var filesCopy = _loadedFiles.ToList();

            var (results, elapsedMs, filesPerSec) = await Task.Run(() => engine.GeneratePreview(filesCopy));

            _allResults.Clear();
            _allResults.AddRange(results);
            ApplyTableFilter();

            var longPathCount = results.Count(it => it.IsLongPath);
            if (BannerLongPath != null)
            {
                BannerLongPath.Visibility = longPathCount > 0 ? Visibility.Visible : Visibility.Collapsed;
                TxtLongPathCount.Text = $"{longPathCount} tệp";
            }

            TxtBenchTime.Text = $"{elapsedMs:F2} ms";
            TxtBenchThroughput.Text = $"{filesPerSec:N0} tệp/giây";
        }

        private async void BtnAutoTruncate_Click(object sender, RoutedEventArgs e)
        {
            TabClean.IsChecked = true;
            ChkTruncateLongPath.IsChecked = true;
            RadTruncMiddle.IsChecked = true;
            await RecomputePreviewAsync();
            ShowBanner("Đã kích hoạt chế độ Co Gọn Full Path An Toàn (Middle-Ellipsis)!");
        }

        private void BtnApply_Click(object sender, RoutedEventArgs e)
        {
            var itemsToRename = (GridFiles.ItemsSource as List<RenameItem>) ?? _allResults;
            if (itemsToRename.Count == 0 || _isRenamed) return;

            try
            {
                var count = _transactionManager.Commit(itemsToRename.ToList());

                var unchangedCount = 0;
                foreach (var item in itemsToRename)
                {
                    if (string.Equals(item.OriginalName, item.NewName, StringComparison.OrdinalIgnoreCase))
                    {
                        item.Status = "unchanged";
                        unchangedCount++;
                    }
                    else
                    {
                        var dir = Path.GetDirectoryName(item.OriginalPath) ?? "";
                        item.OriginalPath = Path.Combine(dir, item.NewName);
                        item.Status = "renamed";
                    }
                }

                GridFiles.Items.Refresh();
                _isRenamed = true;
                BtnApply.IsEnabled = false;
                BtnApply.Content = "✔ Đã Đổi Xong";

                var msg = $"Đổi tên thành công {count} tệp tin trên ổ cứng!";
                if (unchangedCount > 0)
                {
                    msg += $" ({unchangedCount} tệp không đổi tên nên được giữ nguyên)";
                }
                ShowBanner(msg);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Lỗi đổi tên: {ex.Message}", "Lỗi Thực Thi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void BtnRollback_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var count = _transactionManager.Rollback();
                _isRenamed = false;
                BtnApply.IsEnabled = true;
                BtnApply.Content = "▶ Đổi Tên";

                await RecomputePreviewAsync();
                ShowBanner($"Đã hoàn tác (Rollback) thành công {count} tệp tin về tên ban đầu!");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Lỗi hoàn tác: {ex.Message}", "Lỗi Hoàn Tác", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnExportCsv_Click(object sender, RoutedEventArgs e)
        {
            var itemsToExport = (GridFiles.ItemsSource as List<RenameItem>) ?? _allResults;
            if (itemsToExport.Count == 0) return;

            var dialog = new SaveFileDialog
            {
                Filter = "CSV Files (*.csv)|*.csv",
                FileName = "danh_sach_doi_ten.csv",
                Title = "Lưu danh sách báo cáo đổi tên dạng CSV"
            };

            if (dialog.ShowDialog() == true)
            {
                try
                {
                    var sb = new StringBuilder();
                    sb.AppendLine("ID,Đường dẫn gốc,Tên ban đầu,Tên mới dự kiến,Trạng thái");

                    foreach (var item in itemsToExport)
                    {
                        var line = $"\"{item.Id}\",\"{item.OriginalPath}\",\"{item.OriginalName}\",\"{item.NewName}\",\"{item.StatusDisplay}\"";
                        sb.AppendLine(line);
                    }

                    File.WriteAllText(dialog.FileName, sb.ToString(), Encoding.UTF8);
                    ShowBanner($"Đã xuất thành công file CSV: {Path.GetFileName(dialog.FileName)}");
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Lỗi xuất CSV: {ex.Message}", "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void BtnOpenFile_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is RenameItem item)
            {
                OpenFileOrFolderInExplorer(item);
            }
        }

        private void OpenFileOrFolderInExplorer(RenameItem item)
        {
            try
            {
                string? fileToSelect = null;
                if (!string.IsNullOrEmpty(item.OriginalPath) && (File.Exists(item.OriginalPath) || Directory.Exists(item.OriginalPath)))
                {
                    fileToSelect = item.OriginalPath;
                }
                else if (!string.IsNullOrEmpty(item.TargetPath) && (File.Exists(item.TargetPath) || Directory.Exists(item.TargetPath)))
                {
                    fileToSelect = item.TargetPath;
                }

                string? parentDir = null;
                if (!string.IsNullOrEmpty(fileToSelect))
                {
                    parentDir = Path.GetDirectoryName(fileToSelect);
                }
                if (string.IsNullOrEmpty(parentDir) || !Directory.Exists(parentDir))
                {
                    parentDir = Path.GetDirectoryName(item.OriginalPath);
                }
                if (string.IsNullOrEmpty(parentDir) || !Directory.Exists(parentDir))
                {
                    parentDir = Path.GetDirectoryName(item.TargetPath);
                }
                if (string.IsNullOrEmpty(parentDir) || !Directory.Exists(parentDir))
                {
                    parentDir = _currentFolderPath;
                }

                if (!string.IsNullOrEmpty(fileToSelect) && (File.Exists(fileToSelect) || Directory.Exists(fileToSelect)))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "explorer.exe",
                        Arguments = $"/select,\"{fileToSelect}\"",
                        UseShellExecute = true
                    });
                    return;
                }

                if (!string.IsNullOrEmpty(parentDir) && Directory.Exists(parentDir))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "explorer.exe",
                        Arguments = $"\"{parentDir}\"",
                        UseShellExecute = true
                    });
                }
            }
            catch
            {
                try
                {
                    var fallbackDir = !string.IsNullOrEmpty(_currentFolderPath) && Directory.Exists(_currentFolderPath)
                        ? _currentFolderPath
                        : Path.GetDirectoryName(item.OriginalPath);

                    if (!string.IsNullOrEmpty(fallbackDir) && Directory.Exists(fallbackDir))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "explorer.exe",
                            Arguments = $"\"{fallbackDir}\"",
                            UseShellExecute = true
                        });
                    }
                }
                catch { }
            }
        }

        private async void BtnClear_Click(object sender, RoutedEventArgs e)
        {
            _currentFolderPath = "";
            TxtCurrentFolder.Text = "Chưa chọn thư mục (Bấm 'Quét Thư Mục' hoặc 'Chọn Files')";
            BtnOpenExplorer.Visibility = Visibility.Collapsed;
            BtnCloseFolder.Visibility = Visibility.Collapsed;

            _loadedFiles.Clear();
            _allResults.Clear();
            _allImageResults.Clear();
            _imageItems.Clear();

            GridFiles.ItemsSource = null;
            if (RadModeImage != null) RadModeImage.Content = "🖼️ Giảm Kích Thước Ảnh (0)";

            _isRenamed = false;
            BtnApply.IsEnabled = true;
            BtnApply.Content = "▶ Đổi Tên";
            BannerMessage.Visibility = Visibility.Collapsed;
            await RecomputePreviewAsync();
            UpdateImageSelectionCount();
        }

        private void BtnOpenExplorer_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrEmpty(_currentFolderPath) && Directory.Exists(_currentFolderPath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{_currentFolderPath}\"",
                    UseShellExecute = true
                });
            }
        }

        private async void BtnCloseFolder_Click(object sender, RoutedEventArgs e)
        {
            _scanCts?.Cancel();
            _currentFolderPath = "";
            TxtCurrentFolder.Text = "Chưa chọn thư mục (Bấm 'Quét Thư Mục' hoặc 'Chọn Files')";
            BtnOpenExplorer.Visibility = Visibility.Collapsed;
            BtnCloseFolder.Visibility = Visibility.Collapsed;
            _loadedFiles.Clear();
            _allResults.Clear();
            _allImageResults.Clear();
            _imageItems.Clear();

            GridFiles.ItemsSource = null;
            TxtSearch.Text = "";
            if (RadFilterAll != null) RadFilterAll.IsChecked = true;
            if (RadModeImage != null) RadModeImage.Content = "🖼️ Giảm Kích Thước Ảnh (0)";

            TxtItemCount.Text = "Sẵn sàng: 0 tệp tin";
            SetGridLoading(false);
            await RecomputePreviewAsync();
            UpdateImageSelectionCount();
        }

        private void ShowBanner(string message)
        {
            TxtBanner.Text = message;
            BannerMessage.Visibility = Visibility.Visible;
        }

        private void BtnCloseBanner_Click(object sender, RoutedEventArgs e)
        {
            BannerMessage.Visibility = Visibility.Collapsed;
        }

        #region About & GitHub Links

        private void BrandLogo_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            ShowAboutModal();
        }

        private void BtnAbout_Click(object sender, RoutedEventArgs e)
        {
            ShowAboutModal();
        }

        private void BtnCloseAbout_Click(object sender, RoutedEventArgs e)
        {
            ModalAbout.Visibility = Visibility.Collapsed;
        }

        private void ShowAboutModal()
        {
            ModalAbout.Visibility = Visibility.Visible;
        }

        private void BtnDownloadUpdate_Click(object sender, RoutedEventArgs e)
        {
            OpenUrl("https://github.com/nguyenductai1983/RenameFile/releases");
        }

        private void BtnGitHub_Click(object sender, RoutedEventArgs e)
        {
            OpenUrl("https://github.com/nguyenductai1983/RenameFile");
        }

        private void BtnGitHubIssues_Click(object sender, RoutedEventArgs e)
        {
            OpenUrl("https://github.com/nguyenductai1983/RenameFile/issues");
        }

        private void TxtGitHubLink_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            ShowAboutModal();
        }

        private void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                ShowBanner($"Không thể mở trình duyệt: {ex.Message}");
            }
        }

        #endregion

        #region Drag and Drop Handling

        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.Copy;
                e.Handled = true;
            }
        }

        private async void Window_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var paths = e.Data.GetData(DataFormats.FileDrop) as string[];
                if (paths != null && paths.Length > 0)
                {
                    await HandleDroppedPathsAsync(paths);
                }
            }
        }

        private async Task HandleDroppedPathsAsync(string[] paths)
        {
            if (paths.Length == 1 && Directory.Exists(paths[0]))
            {
                _currentFolderPath = paths[0];
                TxtCurrentFolder.Text = _currentFolderPath;
                BtnOpenExplorer.Visibility = Visibility.Visible;
                BtnCloseFolder.Visibility = Visibility.Visible;

                _loadedFiles.Clear();
                _allResults.Clear();
                GridFiles.ItemsSource = null;
                TxtSearch.Text = "";
                if (RadFilterAll != null) RadFilterAll.IsChecked = true;

                await RescanCurrentFolderAsync();
            }
            else
            {
                _isRenamed = false;
                BtnApply.IsEnabled = true;
                BtnApply.Content = "▶ Bắt Đầu Đổi Tên";

                _currentFolderPath = "";
                TxtCurrentFolder.Text = $"(Đang chọn {paths.Length} tệp tin từ kéo thả)";
                BtnOpenExplorer.Visibility = Visibility.Collapsed;
                BtnCloseFolder.Visibility = Visibility.Collapsed;

                _loadedFiles.Clear();
                _allResults.Clear();
                GridFiles.ItemsSource = null;
                TxtSearch.Text = "";
                if (RadFilterAll != null) RadFilterAll.IsChecked = true;

                SetGridLoading(true, "Đang nạp tệp tin...", $"Đang xử lý {paths.Length:N0} mục kéo thả...");

                try
                {
                    foreach (var p in paths)
                    {
                        if (File.Exists(p))
                        {
                            _loadedFiles.Add(p);
                        }
                        else if (Directory.Exists(p))
                        {
                            var scanned = await DirectoryScanner.ScanAsync(
                                p, 
                                ChkRecursive.IsChecked == true, 
                                ChkHidden.IsChecked == true, 
                                ChkFolders.IsChecked == true);
                            _loadedFiles.AddRange(scanned);
                        }
                    }

                    await RecomputePreviewAsync();
                    await LoadAndInspectImagesAsync();
                    ShowBanner($"Đã nạp thành công {_loadedFiles.Count:N0} tệp tin");
                }
                finally
                {
                    SetGridLoading(false);
                }
            }
        }

        #endregion

        #endregion
    }
}
