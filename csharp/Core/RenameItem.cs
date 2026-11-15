using System.ComponentModel;
using System.IO;

namespace CSharpFileRenamer.Core
{
    public class RenameItem : INotifyPropertyChanged
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public int Index { get; set; }
        public string OriginalPath { get; set; } = "";
        public string OriginalName { get; set; } = "";
        
        private string _newName = "";
        public string NewName 
        { 
            get => _newName; 
            set 
            { 
                if (_newName != value) 
                { 
                    _newName = value; 
                    OnPropertyChanged(nameof(NewName)); 
                } 
            } 
        }

        private string _targetPath = "";
        public string TargetPath 
        { 
            get => _targetPath; 
            set 
            { 
                if (_targetPath != value) 
                { 
                    _targetPath = value; 
                    OnPropertyChanged(nameof(TargetPath)); 
                    OnPropertyChanged(nameof(FullPathLength));
                    OnPropertyChanged(nameof(IsLongPath));
                    OnPropertyChanged(nameof(FullPathBadge));
                } 
            } 
        }

        public int FullPathLength => !string.IsNullOrEmpty(TargetPath) ? TargetPath.Length : (OriginalPath?.Length ?? 0);
        public bool IsLongPath => FullPathLength >= 250;
        public string FullPathBadge => IsLongPath ? $"⚠️ {FullPathLength} kt" : $"{FullPathLength} kt";

        private string _status = "pending";
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

        public bool HasCollision { get; set; }

        public string StatusDisplay => Status switch
        {
            "renamed" => "Đã đổi",
            "collision_resolved" => "Trùng: _1",
            "unchanged" => "Giữ nguyên",
            _ => "Sẵn sàng"
        };

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
