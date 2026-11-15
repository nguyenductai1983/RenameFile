using System.ComponentModel;
using System.IO;

namespace CSharpFileRenamer.Core
{
    public class ImageItem : INotifyPropertyChanged
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public int Index { get; set; }
        public string FilePath { get; set; } = "";
        public string FileName => Path.GetFileName(FilePath);
        public string Directory => Path.GetDirectoryName(FilePath) ?? "";
        public string Extension => Path.GetExtension(FilePath).ToLowerInvariant();

        public int OriginalWidth { get; set; }
        public int OriginalHeight { get; set; }
        public string OriginalDimensions => OriginalWidth > 0 && OriginalHeight > 0 
            ? $"{OriginalWidth} × {OriginalHeight}" 
            : "Chưa rõ";

        public long OriginalSize { get; set; }
        public string OriginalSizeFormatted => ImageResizer.FormatFileSize(OriginalSize);

        private int _targetWidth;
        public int TargetWidth
        {
            get => _targetWidth;
            set
            {
                if (_targetWidth != value)
                {
                    _targetWidth = value;
                    OnPropertyChanged(nameof(TargetWidth));
                    OnPropertyChanged(nameof(TargetDimensionsDisplay));
                }
            }
        }

        private int _targetHeight;
        public int TargetHeight
        {
            get => _targetHeight;
            set
            {
                if (_targetHeight != value)
                {
                    _targetHeight = value;
                    OnPropertyChanged(nameof(TargetHeight));
                    OnPropertyChanged(nameof(TargetDimensionsDisplay));
                }
            }
        }

        private bool _isAlreadySmaller;
        public bool IsAlreadySmaller
        {
            get => _isAlreadySmaller;
            set
            {
                if (_isAlreadySmaller != value)
                {
                    _isAlreadySmaller = value;
                    OnPropertyChanged(nameof(IsAlreadySmaller));
                    OnPropertyChanged(nameof(TargetDimensionsDisplay));
                }
            }
        }

        public string TargetDimensionsDisplay
        {
            get
            {
                if (IsAlreadySmaller)
                {
                    return $"{OriginalWidth} × {OriginalHeight} (Đã nhỏ hơn)";
                }
                if (TargetWidth > 0 && TargetHeight > 0)
                {
                    return $"{TargetWidth} × {TargetHeight}";
                }
                return OriginalDimensions;
            }
        }

        private bool _isSelected = true;
        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                if (_isSelected != value)
                {
                    _isSelected = value;
                    OnPropertyChanged(nameof(IsSelected));
                }
            }
        }

        private string _status = "ready";
        public string Status
        {
            get => _status;
            set
            {
                if (_status != value)
                {
                    _status = value;
                    OnPropertyChanged(nameof(Status));
                    OnPropertyChanged(nameof(StatusDisplay));
                }
            }
        }

        private string? _statusNote;
        public string? StatusNote
        {
            get => _statusNote;
            set
            {
                if (_statusNote != value)
                {
                    _statusNote = value;
                    OnPropertyChanged(nameof(StatusNote));
                }
            }
        }

        public string StatusDisplay => Status switch
        {
            "success" => "✔ Đã giảm",
            "skipped_smaller" => "🛡️ Giữ nguyên (đã nhỏ hơn)",
            "skipped_larger" => "🛡️ Giữ nguyên (bảo vệ dung lượng)",
            "error" => "❌ Lỗi",
            _ => "Sẵn sàng"
        };

        private long _newSize;
        public long NewSize
        {
            get => _newSize;
            set
            {
                if (_newSize != value)
                {
                    _newSize = value;
                    OnPropertyChanged(nameof(NewSize));
                    OnPropertyChanged(nameof(NewSizeFormatted));
                }
            }
        }

        public string NewSizeFormatted => _newSize > 0 ? ImageResizer.FormatFileSize(_newSize) : "-";

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
