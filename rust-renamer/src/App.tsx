import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderOpen,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Trash2,
  FileSpreadsheet,
  ExternalLink,
  Search,
  Sparkles,
  Replace,
  Hash,
  Type,
  Loader2,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { ConfirmOverwriteModal } from './components/ConfirmOverwriteModal';
import { ImageResizerView, ImageItem, ResizeResultItem } from './components/ImageResizerView';
import { ResizeConfig } from './components/ConfirmOverwriteModal';

interface ResizeProgressPayload {
  current: number;
  total: number;
  current_file: string;
  percent: number;
}

interface BatchResizeSummary {
  total: number;
  succeeded: number;
  failed: number;
  original_size_total: number;
  new_size_total: number;
  saved_bytes: number;
  items: ResizeResultItem[];
}

interface FileItem {
  id: string;
  path: string;
  old_name: string;
  new_name: string;
  status: string;
  full_path_len?: number;
  is_long_path?: boolean;
}

interface ActiveRules {
  // Tab 1: Chuẩn hóa & Dấu
  remove_vietnamese: boolean;
  clean_whitespace: boolean;
  space_rule: boolean;
  space_action: 'remove_all' | 'trim' | 'collapse';
  sanitize: boolean;
  sanitize_replacement: string;
  web_safe_slug: boolean;
  slug_separator: '-' | '_';
  truncate_long_path: boolean;
  max_path_length: number;
  use_middle_ellipsis: boolean;

  // Tab 2: Tìm & Thay thế
  find_replace: boolean;
  find_text: string;
  replace_text: string;
  find_regex: boolean;
  find_match_case: boolean;

  // Tab 3: Chèn & Đánh số
  prefix_suffix: boolean;
  prefix_text: string;
  suffix_text: string;
  numbering: boolean;
  numbering_start: number;
  numbering_step: number;
  numbering_padding: number;
  numbering_position: 'prefix' | 'suffix' | 'replace_all';
  numbering_custom_text: string;

  // Tab 4: Kiểu chữ & Extension
  case_transform: boolean;
  case_type: 'upper' | 'lower' | 'title' | 'sentence';
  change_extension: boolean;
  new_extension: string;
}

export default function App() {
  // Chế độ chính của ứng dụng: Đổi tên file hoặc Giảm kích thước ảnh
  const [mainMode, setMainMode] = useState<'renamer' | 'resizer'>('renamer');

  // Danh sách ảnh & cấu hình nén/thu nhỏ ảnh
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [isInspectingImages, setIsInspectingImages] = useState(false);
  const [selectedImagePaths, setSelectedImagePaths] = useState<Set<string>>(new Set());
  const [resizeConfig, setResizeConfig] = useState<ResizeConfig>({
    max_width: 1920,
    max_height: 1080,
    preserve_aspect_ratio: true,
    quality: 80,
    format_mode: 'original',
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState<ResizeProgressPayload | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resizeResults, setResizeResults] = useState<Record<string, ResizeResultItem>>({});

  const [files, setFiles] = useState<string[]>([]);
  const [previewItems, setPreviewItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Tab cấu hình quy tắc hiện tại
  const [activeTab, setActiveTab] = useState<'clean' | 'find_replace' | 'numbering' | 'case'>('clean');

  // Bộ lọc tìm kiếm nhanh trong bảng danh sách
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'renamed' | 'unchanged' | 'collision'>('all');

  // Trạng thái phiên đổi tên vừa thực thi (ngăn preview tự động ghi đè tên ban đầu)
  const [isRenamed, setIsRenamed] = useState(false);

  // Thư mục hiện tại đang được chọn để quét
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');

  // Trạng thái quét tệp tin ngầm & tiến độ thời gian thực
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    count: number;
    currentDir: string;
    dirCount?: number;
    skippedCount?: number;
    lastSkipped?: string;
  }>({
    count: 0,
    currentDir: '',
    dirCount: 0,
    skippedCount: 0,
    lastSkipped: '',
  });

  // Tùy chọn quét thư mục nâng cao
  const [recursiveScan, setRecursiveScan] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [includeFolders, setIncludeFolders] = useState(false);

  const [rules, setRules] = useState<ActiveRules>({
    remove_vietnamese: true,
    clean_whitespace: false,
    space_rule: true,
    space_action: 'collapse',
    sanitize: true,
    sanitize_replacement: '_',
    web_safe_slug: false,
    slug_separator: '-',
    truncate_long_path: false,
    max_path_length: 250,
    use_middle_ellipsis: true,

    find_replace: false,
    find_text: '',
    replace_text: '',
    find_regex: false,
    find_match_case: false,

    prefix_suffix: false,
    prefix_text: '',
    suffix_text: '',
    numbering: false,
    numbering_start: 1,
    numbering_step: 1,
    numbering_padding: 3,
    numbering_position: 'suffix',
    numbering_custom_text: '_',

    case_transform: false,
    case_type: 'title',
    change_extension: false,
    new_extension: '',
  });

  // Khi thay đổi quy tắc, nếu phiên trước đã đổi tên thì bắt đầu phiên mới trên các file hiện tại
  const updateRules = (updater: (prev: ActiveRules) => ActiveRules) => {
    setRules((prev) => {
      const next = updater(prev);
      if (isRenamed) {
        const currentDiskFiles = previewItems.map((item) => item.path);
        setFiles(currentDiskFiles);
        setIsRenamed(false);
      }
      return next;
    });
  };

  const triggerPreview = useCallback(async (currentFiles: string[], currentRules: ActiveRules) => {
    if (currentFiles.length === 0) {
      setPreviewItems([]);
      return;
    }

    try {
      setLoading(true);
      const ruleConfigs = [];

      if (currentRules.remove_vietnamese) {
        ruleConfigs.push({ type: 'remove_vietnamese', scope: 'StemOnly' });
      }
      if (currentRules.sanitize) {
        ruleConfigs.push({
          type: 'sanitize',
          replacement: currentRules.sanitize_replacement,
          scope: 'FullName',
        });
      }
      if (currentRules.clean_whitespace) {
        ruleConfigs.push({ type: 'clean_whitespace', scope: 'StemOnly' });
      }
      if (currentRules.space_rule) {
        ruleConfigs.push({
          type: 'space',
          action: currentRules.space_action,
          scope: 'StemOnly',
        });
      }
      if (currentRules.web_safe_slug) {
        ruleConfigs.push({
          type: 'web_safe_slug',
          separator: currentRules.slug_separator,
          scope: 'StemOnly',
        });
      }

      // Tab 2: Tìm kiếm và Thay thế (Find & Replace)
      if (currentRules.find_replace && currentRules.find_text) {
        ruleConfigs.push({
          type: 'find_replace',
          find: currentRules.find_text,
          replace: currentRules.replace_text,
          use_regex: currentRules.find_regex,
          match_case: currentRules.find_match_case,
          scope: 'StemOnly',
        });
      }

      // Tab 3: Tiền tố & Hậu tố (Prefix/Suffix) & Đánh số thứ tự (Numbering)
      if (currentRules.prefix_suffix && (currentRules.prefix_text || currentRules.suffix_text)) {
        ruleConfigs.push({
          type: 'prefix_suffix',
          prefix: currentRules.prefix_text,
          suffix: currentRules.suffix_text,
          scope: 'StemOnly',
        });
      }
      if (currentRules.numbering) {
        ruleConfigs.push({
          type: 'numbering',
          start: currentRules.numbering_start,
          step: currentRules.numbering_step,
          padding: currentRules.numbering_padding,
          position: currentRules.numbering_position,
          custom_text: currentRules.numbering_custom_text,
          scope: 'StemOnly',
        });
      }

      // Tab 4: Đổi kiểu chữ (Case Transform) & Thay đổi extension
      if (currentRules.case_transform) {
        ruleConfigs.push({
          type: 'case',
          case_type: currentRules.case_type,
          scope: 'StemOnly',
        });
      }
      if (currentRules.change_extension && currentRules.new_extension.trim()) {
        ruleConfigs.push({
          type: 'change_extension',
          new_extension: currentRules.new_extension.trim(),
        });
      }

      // Tối ưu hóa Full Path an toàn (áp dụng cuối cùng trong pipeline để đảm bảo an toàn tuyệt đối)
      if (currentRules.truncate_long_path) {
        ruleConfigs.push({
          type: 'truncate_long_path',
          max_length: currentRules.max_path_length,
          use_middle: currentRules.use_middle_ellipsis,
        });
      }

      const results = await invoke<FileItem[]>('preview_renaming', {
        files: currentFiles,
        rules: ruleConfigs,
      });

      setPreviewItems(results);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi xem trước: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Chỉ tự động tính toán preview khi chưa bấm nút "Đổi Tên"
  useEffect(() => {
    if (!isRenamed) {
      triggerPreview(files, rules);
    }
  }, [files, rules, triggerPreview, isRenamed]);

  // Lắng nghe sự kiện streaming tiến độ quét thư mục từ Rust Backend
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<{
      count: number;
      current_dir: string;
      dir_count?: number;
      skipped_count?: number;
      last_skipped?: string;
    }>('scan-progress', (event) => {
      setScanProgress({
        count: event.payload.count,
        currentDir: event.payload.current_dir,
        dirCount: event.payload.dir_count ?? 0,
        skippedCount: event.payload.skipped_count ?? 0,
        lastSkipped: event.payload.last_skipped ?? '',
      });
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Lắng nghe sự kiện tiến độ giảm kích thước ảnh từ Rust Backend
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<ResizeProgressPayload>('image-resize-progress', (event) => {
      setResizeProgress(event.payload);
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Tự động nhận diện và đọc thông số các file hình ảnh khi danh sách file thay đổi
  useEffect(() => {
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
    const imagePaths = files.filter((f) => {
      const ext = f.split('.').pop()?.toLowerCase();
      return ext && imageExts.has(ext);
    });

    if (imagePaths.length > 0) {
      setIsInspectingImages(true);
      invoke<ImageItem[]>('inspect_image_files', { files: imagePaths })
        .then((items) => {
          setImageItems(items);
          setSelectedImagePaths(new Set(items.filter((i) => i.is_valid).map((i) => i.path)));
        })
        .catch((err) => {
          console.error('Lỗi kiểm tra ảnh:', err);
        })
        .finally(() => {
          setIsInspectingImages(false);
        });
    } else {
      setImageItems([]);
      setSelectedImagePaths(new Set());
    }
  }, [files]);

  const handleCancelScan = async () => {
    try {
      await invoke('cancel_scan');
      setMessage({ text: 'Đang gửi yêu cầu dừng quét...', type: 'info' });
    } catch (err: unknown) {
      console.error('Lỗi hủy quét:', err);
    }
  };

  const handleSelectFiles = async () => {
    try {
      const selected = await invoke<string[]>('select_files');
      if (selected && selected.length > 0) {
        // Xóa sạch danh sách đang có ngay lập tức khi chọn file mới
        setFiles([]);
        setPreviewItems([]);
        setSearchQuery('');
        setStatusFilter('all');
        setIsRenamed(false);
        setCurrentFolderPath(''); // Chuyển sang chế độ chọn tệp tin riêng lẻ
        setLoading(true);
        setFiles(selected);
        setMessage({ text: `Đã nạp ${selected.length.toLocaleString()} tệp tin`, type: 'info' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Không thể mở dialog: ${errMsg}`, type: 'error' });
    }
  };

  const performScan = async (
    targetFolder: string,
    rec: boolean,
    hid: boolean,
    fld: boolean
  ) => {
    if (!targetFolder) return;
    try {
      // Xóa danh sách cũ ngay lập tức và đưa vào trạng thái loading
      setFiles([]);
      setPreviewItems([]);
      setIsScanning(true);
      setScanProgress({ count: 0, currentDir: targetFolder, dirCount: 0, skippedCount: 0, lastSkipped: '' });
      setLoading(true);
      const scanned = await invoke<string[]>('scan_selected_directory', {
        folderPath: targetFolder,
        recursive: rec,
        includeHidden: hid,
        includeFolders: fld,
      });
      if (scanned && scanned.length > 0) {
        setIsRenamed(false);
        setFiles(scanned);
        setMessage({
          text: `Đã quét được ${scanned.length.toLocaleString()} mục (${rec ? 'Bao gồm thư mục con' : 'Chỉ thư mục hiện tại'}${
            fld ? ', gồm đổi tên folder thư mục' : ''
          }${hid ? ', gồm file ẩn' : ''})`,
          type: 'info',
        });
      } else {
        setFiles([]);
        setPreviewItems([]);
        setMessage({ text: 'Thư mục trống hoặc không chứa file phù hợp', type: 'info' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi quét thư mục: ${errMsg}`, type: 'error' });
    } finally {
      setIsScanning(false);
      setLoading(false);
    }
  };

  const handleScanFolder = async () => {
    try {
      const picked = await invoke<string | null>('select_folder');
      if (picked) {
        // Xóa sạch danh sách đang có ngay lập tức khi chọn thư mục khác
        setFiles([]);
        setPreviewItems([]);
        setSearchQuery('');
        setStatusFilter('all');
        setCurrentFolderPath(picked);
        await performScan(picked, recursiveScan, includeHidden, includeFolders);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Không thể mở hộp thoại chọn thư mục: ${errMsg}`, type: 'error' });
    }
  };

  const handleOptionToggle = (key: 'recursive' | 'hidden' | 'folders', value: boolean) => {
    const newRecursive = key === 'recursive' ? value : recursiveScan;
    const newHidden = key === 'hidden' ? value : includeHidden;
    const newFolders = key === 'folders' ? value : includeFolders;

    if (key === 'recursive') setRecursiveScan(value);
    if (key === 'hidden') setIncludeHidden(value);
    if (key === 'folders') setIncludeFolders(value);

    // Tự động quét lại ngay lập tức nếu đang có thư mục được chọn
    if (currentFolderPath) {
      setFiles([]);
      setPreviewItems([]);
      performScan(currentFolderPath, newRecursive, newHidden, newFolders);
    }
  };

  const handleApply = async () => {
    if (previewItems.length === 0 || isRenamed) return;

    try {
      setLoading(true);
      const updatedItems = await invoke<FileItem[]>('apply_renaming', {
        items: previewItems,
      });

      const renamedCount = updatedItems.filter((it) => it.status === 'renamed').length;
      const unchangedCount = updatedItems.filter((it) => it.status === 'unchanged').length;

      let msg = `Đổi tên thành công ${renamedCount} tệp tin trên ổ cứng!`;
      if (unchangedCount > 0) {
        msg += ` (${unchangedCount} tệp tên không đổi nên được giữ nguyên)`;
      }

      setMessage({
        text: msg,
        type: 'success',
      });

      // Cập nhật danh sách items đã được backend phân loại chuẩn xác trạng thái (renamed / unchanged)
      setPreviewItems(updatedItems);

      // Đánh dấu đã đổi tên thành công để không bị useEffect trigger preview đè mất tên gốc
      setIsRenamed(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi áp dụng: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    try {
      setLoading(true);
      const revertedCount = await invoke<number>('rollback_renaming');
      setMessage({
        text: `Đã hoàn tác (Rollback) thành công ${revertedCount} tệp tin về tên ban đầu!`,
        type: 'success',
      });

      // Phục hồi lại đường dẫn và trạng thái ban đầu
      setPreviewItems((prev) =>
        prev.map((item) => {
          const lastSlash = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
          const dir = lastSlash >= 0 ? item.path.substring(0, lastSlash + 1) : '';
          return {
            ...item,
            path: dir + item.old_name,
            status: 'pending',
          };
        })
      );

      setIsRenamed(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi hoàn tác: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (previewItems.length === 0) return;
    try {
      setLoading(true);
      await invoke('export_to_csv', { exportPath: '', data: previewItems });
      setMessage({ text: 'Xuất danh sách ra file CSV thành công!', type: 'success' });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi xuất CSV: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke('open_folder_in_os', { folderPath: path });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Không thể mở trong Explorer: ${errMsg}`, type: 'error' });
    }
  };

  const handleClear = () => {
    setFiles([]);
    setPreviewItems([]);
    setImageItems([]);
    setSelectedImagePaths(new Set());
    setResizeResults({});
    setCurrentFolderPath('');
    setMessage(null);
    setIsRenamed(false);
  };

  // Xử lý chọn nhanh ảnh
  const handleSelectAllImages = () => {
    setSelectedImagePaths(new Set(imageItems.filter((i) => i.is_valid).map((i) => i.path)));
  };

  const handleDeselectAllImages = () => {
    setSelectedImagePaths(new Set());
  };

  const handleSelectImagesOver2MB = () => {
    const threshold = 2 * 1024 * 1024;
    setSelectedImagePaths(new Set(imageItems.filter((i) => i.is_valid && i.file_size >= threshold).map((i) => i.path)));
  };

  const handleSelectImagesOver1920 = () => {
    setSelectedImagePaths(new Set(imageItems.filter((i) => i.is_valid && (i.width > 1920 || i.height > 1080)).map((i) => i.path)));
  };

  const handleSelectOverTarget = () => {
    const targetW = resizeConfig.max_width;
    const targetH = resizeConfig.max_height;
    setSelectedImagePaths(
      new Set(
        imageItems
          .filter(
            (i) =>
              i.is_valid &&
              ((targetW > 0 && i.width > targetW) || (targetH > 0 && i.height > targetH))
          )
          .map((i) => i.path)
      )
    );
  };

  const handleToggleSelectImage = (path: string) => {
    setSelectedImagePaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Thực thi giảm kích thước và ghi đè
  const handleExecuteResize = async () => {
    if (selectedImagePaths.size === 0) return;
    setShowConfirmModal(false);
    setIsResizing(true);
    setResizeProgress({ current: 0, total: selectedImagePaths.size, current_file: 'Đang bắt đầu...', percent: 0 });

    try {
      const targetPaths = Array.from(selectedImagePaths);
      const summary = await invoke<BatchResizeSummary>('batch_resize_and_overwrite_images', {
        files: targetPaths,
        config: resizeConfig,
      });

      const resultsMap: Record<string, ResizeResultItem> = {};
      for (const item of summary.items) {
        resultsMap[item.path] = item;
      }
      setResizeResults((prev) => ({ ...prev, ...resultsMap }));

      const savedMb = (summary.saved_bytes / (1024 * 1024)).toFixed(1);
      const percentSaved =
        summary.original_size_total > 0
          ? Math.round((summary.saved_bytes / summary.original_size_total) * 100)
          : 0;

      setMessage({
        text: `🎉 Đã hoàn tất giảm kích thước & ghi đè ${summary.succeeded}/${summary.total} ảnh! Tiết kiệm ${savedMb} MB (${percentSaved}%).`,
        type: 'success',
      });

      // Làm mới lại danh sách ảnh trên ổ cứng
      const updated = await invoke<ImageItem[]>('inspect_image_files', { files: targetPaths });
      setImageItems((prev) => {
        const map = new Map(updated.map((u) => [u.path, u]));
        return prev.map((old) => map.get(old.path) || old);
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi giảm kích thước ảnh: ${errMsg}`, type: 'error' });
    } finally {
      setIsResizing(false);
      setResizeProgress(null);
    }
  };

  // Lọc danh sách xem trước theo từ khóa tìm kiếm và trạng thái
  const filteredItems = useMemo(() => {
    return previewItems.filter((item) => {
      if (statusFilter === 'renamed' && item.status !== 'renamed') return false;
      if (statusFilter === 'unchanged' && item.status !== 'unchanged') return false;
      if (statusFilter === 'collision' && item.status !== 'collision_resolved') return false;
      if ((statusFilter as string) === 'long_path' && !item.is_long_path) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.old_name.toLowerCase().includes(q) ||
          item.new_name.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [previewItems, searchQuery, statusFilter]);

  // Đếm số lượng tệp tin có Full Path vượt quá ngưỡng an toàn 250 ký tự
  const longPathCount = useMemo(() => {
    return previewItems.filter((i) => i.is_long_path).length;
  }, [previewItems]);

  // Giới hạn số dòng render vào HTML DOM để đảm bảo mượt mà 60 FPS khi danh sách lớn (>10,000 tệp)
  const [displayLimit, setDisplayLimit] = useState(500);
  const [isExpanding, setIsExpanding] = useState(false);

  useEffect(() => {
    setDisplayLimit(500);
  }, [searchQuery, statusFilter, previewItems.length]);

  const handleExpandDisplay = (targetLimit: number) => {
    setIsExpanding(true);
    // Nhường quyền cho browser hiển thị overlay loading trước khi React mount hàng chục nghìn thẻ DOM
    setTimeout(() => {
      setDisplayLimit(targetLimit);
      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsExpanding(false);
        }, 60);
      });
    }, 50);
  };

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, displayLimit);
  }, [filteredItems, displayLimit]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 font-sans text-slate-100">
      {/* Top Header */}
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-6 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="/icon.png"
            alt="Rename File Viet Logo"
            className="h-10 w-10 rounded-xl shadow-md shadow-indigo-500/25 object-cover border border-indigo-500/20"
          />
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">Rename File Viet</h1>
            <p className="text-xs text-slate-400">Tiện ích đổi tên tệp tiếng Việt &amp; xử lý hàng loạt (Tauri v2 + Rust)</p>
          </div>
        </div>

        {/* Chuyển đổi chế độ: Đổi Tên File vs Giảm Kích Thước Ảnh */}
        <div className="flex items-center rounded-xl bg-slate-950/90 p-1 border border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => setMainMode('renamer')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              mainMode === 'renamer'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>🏷️ Đổi Tên Tệp</span>
            {previewItems.length > 0 && (
              <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
                {previewItems.length.toLocaleString()}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainMode('resizer')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              mainMode === 'resizer'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>🖼️ Giảm Kích Thước Ảnh</span>
            {imageItems.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono ${
                  mainMode === 'resizer'
                    ? 'bg-rose-950 text-rose-200 border border-rose-800/60'
                    : 'bg-slate-800 text-rose-400'
                }`}
              >
                {imageItems.length.toLocaleString()} ảnh
              </span>
            )}
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút Quét Thư Mục (Vàng Cam Amber - đặc trưng Thư mục) */}
          <button
            onClick={handleScanFolder}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-amber-900/30 transition hover:bg-amber-500 active:scale-95 cursor-pointer"
            title="Quét toàn bộ tệp tin trong thư mục"
          >
            <FolderOpen className="h-4 w-4" />
            Quét Thư Mục
          </button>

          {/* Nút Chọn Files (Xanh Tím Indigo - đặc trưng Tệp tin) */}
          <button
            onClick={handleSelectFiles}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-900/30 transition hover:bg-indigo-500 active:scale-95 cursor-pointer"
            title="Chọn một hoặc nhiều tệp tin riêng lẻ"
          >
            <FileText className="h-4 w-4" />
            Chọn Files
          </button>

          <button
            onClick={handleApply}
            disabled={files.length === 0 || loading || isRenamed}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${
              isRenamed
                ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40'
            }`}
          >
            <Play className="h-4 w-4" />
            {isRenamed ? 'Đã Đổi Tên Xong' : 'Đổi Tên'}
          </button>

          <button
            onClick={handleRollback}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 active:scale-95"
            title="Hoàn tác (Undo) phiên đổi tên trước"
          >
            <RotateCcw className="h-4 w-4" />
            Undo
          </button>

          {previewItems.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 active:scale-95"
              title="Xuất danh sách ra file CSV / Excel"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              CSV
            </button>
          )}

          {files.length > 0 && (
            <button
              onClick={handleClear}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
              title="Xóa danh sách"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Thanh trạng thái thư mục đã chọn & Các tùy chọn quét */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/70 px-6 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderOpen className="h-4 w-4 shrink-0 text-indigo-400" />
          <span className="shrink-0 font-medium text-slate-400">Thư mục hiện tại:</span>
          {currentFolderPath ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="truncate font-mono text-indigo-300 bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-700/60 max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl"
                title={currentFolderPath}
              >
                {currentFolderPath}
              </span>
              <button
                onClick={() => invoke('open_folder_in_os', { folderPath: currentFolderPath })}
                className="shrink-0 p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition"
                title="Mở thư mục này trong Windows Explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentFolderPath('');
                  setFiles([]);
                  setPreviewItems([]);
                }}
                className="shrink-0 text-[11px] text-slate-400 hover:text-red-400 underline ml-1"
                title="Bỏ chọn thư mục"
              >
                Đóng
              </button>
            </div>
          ) : (
            <span className="italic text-slate-500 truncate">
              {files.length > 0
                ? `(Đang chọn ${files.length} tệp tin rời rạc)`
                : 'Chưa chọn thư mục (Bấm "Quét Thư Mục" hoặc "Chọn Files")'}
            </span>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      {mainMode === 'renamer' ? (
        <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Rules Configuration (Tabbed Workflow như Advanced Renamer & BRU) */}
        <aside className="w-88 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col">
          {/* Card: Phạm Vi Quét & Đối Tượng (Trực quan, dễ hiểu, chuyên nghiệp) */}
          <div className="border-b border-slate-800 bg-slate-900/80 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
              <span className="text-indigo-400">⚙️</span>
              <span>PHẠM VI QUÉT &amp; ĐỐI TƯỢNG</span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Option 1: Recursive */}
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={recursiveScan}
                  onChange={(e) => handleOptionToggle('recursive', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 mt-0.5 cursor-pointer"
                />
                <div className="leading-tight">
                  <span className="font-semibold text-slate-200 group-hover:text-white transition">Quét sâu vào thư mục con</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Duyệt đệ quy tất cả tệp tin trong các cấp folder bên trong</p>
                </div>
              </label>

              {/* Option 2: Hidden Files */}
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeHidden}
                  onChange={(e) => handleOptionToggle('hidden', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 mt-0.5 cursor-pointer"
                />
                <div className="leading-tight">
                  <span className="font-semibold text-slate-200 group-hover:text-white transition">Bao gồm cả tệp &amp; thư mục ẩn</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Không bỏ sót các tệp tin hệ thống hoặc file bị ẩn</p>
                </div>
              </label>

              {/* Option 3: Folders */}
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeFolders}
                  onChange={(e) => handleOptionToggle('folders', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 mt-0.5 cursor-pointer"
                />
                <div className="leading-tight">
                  <span className="font-semibold text-slate-200 group-hover:text-white transition">Đổi tên cả thư mục (Folder)</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Áp dụng đổi tên cho cả folder, không chỉ riêng file</p>
                </div>
              </label>
            </div>
          </div>

          {/* Tab Selection Headers */}
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-900/80 p-1.5 gap-1 text-[11px] font-semibold text-slate-400">
            <button
              onClick={() => setActiveTab('clean')}
              className={`flex flex-col items-center py-2 px-1 rounded-lg transition ${
                activeTab === 'clean'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Chuẩn hóa ký tự, dấu tiếng Việt, khoảng trắng"
            >
              <Sparkles className="h-4 w-4 mb-0.5" />
              <span>Chuẩn Hóa</span>
            </button>
            <button
              onClick={() => setActiveTab('find_replace')}
              className={`flex flex-col items-center py-2 px-1 rounded-lg transition ${
                activeTab === 'find_replace'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Tìm và thay thế chuỗi / biểu thức chính quy (Regex)"
            >
              <Replace className="h-4 w-4 mb-0.5" />
              <span>Tìm & Thay</span>
            </button>
            <button
              onClick={() => setActiveTab('numbering')}
              className={`flex flex-col items-center py-2 px-1 rounded-lg transition ${
                activeTab === 'numbering'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Chèn tiền tố, hậu tố và đánh số thứ tự (001, 002...)"
            >
              <Hash className="h-4 w-4 mb-0.5" />
              <span>Đánh Số</span>
            </button>
            <button
              onClick={() => setActiveTab('case')}
              className={`flex flex-col items-center py-2 px-1 rounded-lg transition ${
                activeTab === 'case'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Đổi chữ hoa/thường và thay đổi đuôi mở rộng"
            >
              <Type className="h-4 w-4 mb-0.5" />
              <span>Chữ & Đuôi</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: CHUẨN HÓA & TIẾNG VIỆT */}
            {activeTab === 'clean' && (
              <>
                {/* Vietnamese Clean */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition hover:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rules.remove_vietnamese}
                      onChange={(e) => updateRules((r) => ({ ...r, remove_vietnamese: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-200">Xóa Dấu Tiếng Việt</div>
                      <div className="text-xs text-slate-400">Chuẩn hóa NFD/NFC, Đ/đ $\to$ D/d</div>
                    </div>
                  </label>
                </div>

                {/* SpaceRule */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition hover:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rules.space_rule}
                      onChange={(e) => updateRules((r) => ({ ...r, space_rule: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-200">Xử Lý Khoảng Trắng</div>
                      <div className="text-xs text-slate-400">Tùy chọn xử lý khoảng cách</div>
                      {rules.space_rule && (
                        <div className="mt-2.5 space-y-1.5 pl-1">
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="space_action"
                              checked={rules.space_action === 'collapse'}
                              onChange={() => updateRules((r) => ({ ...r, space_action: 'collapse' }))}
                              className="text-indigo-600"
                            />
                            <span>Dồn nhiều khoảng trắng $\to$ 1</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="space_action"
                              checked={rules.space_action === 'trim'}
                              onChange={() => updateRules((r) => ({ ...r, space_action: 'trim' }))}
                              className="text-indigo-600"
                            />
                            <span>Cắt bỏ khoảng trắng 2 đầu</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="space_action"
                              checked={rules.space_action === 'remove_all'}
                              onChange={() => updateRules((r) => ({ ...r, space_action: 'remove_all' }))}
                              className="text-indigo-600"
                            />
                            <span>Xóa tất cả khoảng trắng</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Sanitize OS */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition hover:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rules.sanitize}
                      onChange={(e) => updateRules((r) => ({ ...r, sanitize: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-200">Làm Sạch Ký Tự Cấm OS</div>
                      <div className="text-xs text-slate-400">Loại bỏ \ / : * ? " &lt; &gt; |</div>
                      {rules.sanitize && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-slate-400">Thay bằng:</span>
                          <input
                            type="text"
                            value={rules.sanitize_replacement}
                            onChange={(e) => updateRules((r) => ({ ...r, sanitize_replacement: e.target.value }))}
                            className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-xs text-white focus:border-indigo-500 focus:outline-none"
                            maxLength={2}
                          />
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Web-safe Slug */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition hover:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rules.web_safe_slug}
                      onChange={(e) => updateRules((r) => ({ ...r, web_safe_slug: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-200">Chuẩn Hóa Web Slug</div>
                      <div className="text-xs text-slate-400">Chữ thường, an toàn URL/Web</div>
                      {rules.web_safe_slug && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateRules((r) => ({ ...r, slug_separator: '-' }))}
                            className={`rounded px-2.5 py-1 text-xs font-mono font-medium ${
                              rules.slug_separator === '-'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            Gạch ngang (-)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRules((r) => ({ ...r, slug_separator: '_' }))}
                            className={`rounded px-2.5 py-1 text-xs font-mono font-medium ${
                              rules.slug_separator === '_'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            Gạch dưới (_)
                          </button>
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Co gọn Full Path an toàn (Smart Path Budgeting & Truncation) */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 transition hover:border-slate-700">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rules.truncate_long_path}
                      onChange={(e) => updateRules((r) => ({ ...r, truncate_long_path: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                        <span>Co Gọn Full Path An Toàn</span>
                      </div>
                      <div className="text-xs text-slate-400">Tự động cắt ngắn nếu đường dẫn &gt; 250 ký tự</div>
                      {rules.truncate_long_path && (
                        <div className="mt-2.5 space-y-2 pl-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Giới hạn tối đa:</span>
                            <input
                              type="number"
                              min="100"
                              max="260"
                              value={rules.max_path_length}
                              onChange={(e) => updateRules((r) => ({ ...r, max_path_length: parseInt(e.target.value) || 250 }))}
                              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-center text-white focus:border-indigo-500 focus:outline-none"
                            />
                            <span className="text-slate-500">ký tự (Windows MAX 260)</span>
                          </div>
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                              <input
                                type="radio"
                                name="trunc_strat"
                                checked={rules.use_middle_ellipsis}
                                onChange={() => updateRules((r) => ({ ...r, use_middle_ellipsis: true }))}
                                className="text-indigo-600"
                              />
                              <span>Cắt giữa: Đầu...Đuôi (Bảo toàn Version/ID)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                              <input
                                type="radio"
                                name="trunc_strat"
                                checked={!rules.use_middle_ellipsis}
                                onChange={() => updateRules((r) => ({ ...r, use_middle_ellipsis: false }))}
                                className="text-indigo-600"
                              />
                              <span>Cắt đuôi: Đầu... (Giữ tên đầu)</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </>
            )}

            {/* TAB 2: TÌM KIẾM VÀ THAY THẾ (Find & Replace - Chuẩn PowerRename / BRU) */}
            {activeTab === 'find_replace' && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700 space-y-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rules.find_replace}
                    onChange={(e) => updateRules((r) => ({ ...r, find_replace: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-slate-200">Kích Hoạt Tìm & Thay Thế</span>
                </label>

                {rules.find_replace && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Tìm từ khóa (Find):</label>
                      <input
                        type="text"
                        placeholder="Chuỗi cần tìm hoặc mẫu Regex..."
                        value={rules.find_text}
                        onChange={(e) => updateRules((r) => ({ ...r, find_text: e.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Thay thế bằng (Replace):</label>
                      <input
                        type="text"
                        placeholder="Để trống nếu muốn xóa bỏ từ khóa..."
                        value={rules.replace_text}
                        onChange={(e) => updateRules((r) => ({ ...r, replace_text: e.target.value }))}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                      />
                    </div>

                    <div className="pt-1 flex flex-col gap-2 text-xs text-slate-300">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rules.find_regex}
                          onChange={(e) => updateRules((r) => ({ ...r, find_regex: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
                        />
                        <span>Sử dụng Biểu thức chính quy (Regex)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rules.find_match_case}
                          onChange={(e) => updateRules((r) => ({ ...r, find_match_case: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
                        />
                        <span>Phân biệt chữ HOA / thường (Match case)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TIỀN TỐ/HẬU TỐ & ĐÁNH SỐ THỨ TỰ (Numbering / Indexing) */}
            {activeTab === 'numbering' && (
              <div className="space-y-4">
                {/* Prefix & Suffix */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700 space-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rules.prefix_suffix}
                      onChange={(e) => updateRules((r) => ({ ...r, prefix_suffix: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-200">Thêm Tiền Tố & Hậu Tố</span>
                  </label>

                  {rules.prefix_suffix && (
                    <div className="space-y-2.5 pt-2">
                      <div>
                        <span className="block text-xs text-slate-400 mb-1">Tiền tố (Đầu tên):</span>
                        <input
                          type="text"
                          placeholder="vd: Project_..."
                          value={rules.prefix_text}
                          onChange={(e) => updateRules((r) => ({ ...r, prefix_text: e.target.value }))}
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-xs text-slate-400 mb-1">Hậu tố (Cuối tên, trước đuôi):</span>
                        <input
                          type="text"
                          placeholder="vd: _final..."
                          value={rules.suffix_text}
                          onChange={(e) => updateRules((r) => ({ ...r, suffix_text: e.target.value }))}
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Numbering / Auto Indexing */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700 space-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rules.numbering}
                      onChange={(e) => updateRules((r) => ({ ...r, numbering: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-200">Đánh Số Thứ Tự (001, 002...)</span>
                  </label>

                  {rules.numbering && (
                    <div className="space-y-3 pt-2 text-xs">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Bắt đầu:</label>
                          <input
                            type="number"
                            min="0"
                            value={rules.numbering_start}
                            onChange={(e) => updateRules((r) => ({ ...r, numbering_start: parseInt(e.target.value) || 0 }))}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Bước nhảy:</label>
                          <input
                            type="number"
                            min="1"
                            value={rules.numbering_step}
                            onChange={(e) => updateRules((r) => ({ ...r, numbering_step: parseInt(e.target.value) || 1 }))}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Chữ số (Pad):</label>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={rules.numbering_padding}
                            onChange={(e) => updateRules((r) => ({ ...r, numbering_padding: parseInt(e.target.value) || 1 }))}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none text-center"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Vị trí chèn số:</label>
                        <div className="space-y-1.5 pl-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="num_pos"
                              checked={rules.numbering_position === 'suffix'}
                              onChange={() => updateRules((r) => ({ ...r, numbering_position: 'suffix' }))}
                              className="text-indigo-600"
                            />
                            <span>Cuối tên (vd: Anh_001)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="num_pos"
                              checked={rules.numbering_position === 'prefix'}
                              onChange={() => updateRules((r) => ({ ...r, numbering_position: 'prefix' }))}
                              className="text-indigo-600"
                            />
                            <span>Đầu tên (vd: 001_Anh)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="num_pos"
                              checked={rules.numbering_position === 'replace_all'}
                              onChange={() => updateRules((r) => ({ ...r, numbering_position: 'replace_all' }))}
                              className="text-indigo-600"
                            />
                            <span>Thay thế tên bằng tiền tố + số</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Ký tự ngăn cách / Tiền tố:</label>
                        <input
                          type="text"
                          value={rules.numbering_custom_text}
                          onChange={(e) => updateRules((r) => ({ ...r, numbering_custom_text: e.target.value }))}
                          placeholder="_"
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: KIỂU CHỮ & ĐUÔI MỞ RỘNG (Case & Extension) */}
            {activeTab === 'case' && (
              <div className="space-y-4">
                {/* Case Rule */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700 space-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rules.case_transform}
                      onChange={(e) => updateRules((r) => ({ ...r, case_transform: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-200">Đổi Kiểu Chữ Hoa / Thường</span>
                  </label>

                  {rules.case_transform && (
                    <div className="space-y-1.5 pt-2 text-xs pl-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="case_type"
                          checked={rules.case_type === 'title'}
                          onChange={() => updateRules((r) => ({ ...r, case_type: 'title' }))}
                          className="text-indigo-600"
                        />
                        <span>Title Case (Viết Hoa Chữ Đầu Mỗi Từ)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="case_type"
                          checked={rules.case_type === 'sentence'}
                          onChange={() => updateRules((r) => ({ ...r, case_type: 'sentence' }))}
                          className="text-indigo-600"
                        />
                        <span>Sentence case (Viết hoa chữ đầu câu)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="case_type"
                          checked={rules.case_type === 'upper'}
                          onChange={() => updateRules((r) => ({ ...r, case_type: 'upper' }))}
                          className="text-indigo-600"
                        />
                        <span>UPPERCASE (VIẾT HOA TOÀN BỘ)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="case_type"
                          checked={rules.case_type === 'lower'}
                          onChange={() => updateRules((r) => ({ ...r, case_type: 'lower' }))}
                          className="text-indigo-600"
                        />
                        <span>lowercase (viết thường toàn bộ)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* ChangeExtensionRule */}
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700 space-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rules.change_extension}
                      onChange={(e) => updateRules((r) => ({ ...r, change_extension: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-200">Đổi Đuôi Mở Rộng (Extension)</span>
                  </label>

                  {rules.change_extension && (
                    <div className="pt-2 flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Đuôi mới:</span>
                      <input
                        type="text"
                        placeholder="png, pdf, mp4..."
                        value={rules.new_extension}
                        onChange={(e) => updateRules((r) => ({ ...r, new_extension: e.target.value }))}
                        className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Content: Real-time Preview Table với Search Bar & Filter Chips */}
        <main className="flex flex-1 flex-col overflow-hidden bg-slate-950 p-5">
          {message && (
            <div
              className={`mb-3.5 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
                message.type === 'success'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : message.type === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border border-blue-500/30 bg-blue-500/10 text-blue-300'
              }`}
            >
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100">
                ✕
              </button>
            </div>
          )}

          {previewItems.length === 0 ? (
            isScanning || loading ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-indigo-500/20 bg-slate-900/60 p-8 text-center shadow-2xl backdrop-blur-sm">
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-950/80 border border-indigo-500/30 shadow-lg shadow-indigo-950/50">
                  <div className="absolute inset-0 rounded-3xl bg-indigo-500/10 animate-ping" />
                  <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                </div>
                <h3 className="text-base font-semibold text-slate-100">
                  {isScanning ? 'Đang quét thư mục...' : 'Đang xử lý & tải danh sách tệp tin...'}
                </h3>
                <p className="mt-2 max-w-md text-xs text-slate-400">
                  {isScanning
                    ? `Đã tìm thấy ${scanProgress.count.toLocaleString()} tệp tin (${(scanProgress.dirCount ?? 0).toLocaleString()} thư mục đã duyệt)`
                    : 'Hệ thống đang chuẩn bị xem trước và tối ưu hóa hiển thị, vui lòng chờ trong giây lát...'}
                </p>
                {isScanning && scanProgress.currentDir && (
                  <div className="mt-4 max-w-lg truncate rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-2 font-mono text-[11px] text-slate-300">
                    📂 {scanProgress.currentDir}
                  </div>
                )}
                {isScanning && (
                  <button
                    onClick={handleCancelScan}
                    className="mt-5 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition cursor-pointer"
                  >
                    ✕ Dừng Quét Thư Mục
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
                  <FileCode className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-200">Chưa có tập tin nào</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Chọn danh sách file riêng lẻ hoặc quét toàn bộ thư mục để bắt đầu trải nghiệm bộ công cụ đổi tên chuyên nghiệp.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={handleScanFolder}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-amber-900/30 transition cursor-pointer"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Quét Toàn Bộ Thư Mục
                  </button>
                  <button
                    onClick={handleSelectFiles}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-900/30 transition cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Mở Hộp Thoại Chọn Files
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-inner">
              {(loading || isExpanding) && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-xs">
                  <div className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-slate-900/90 px-5 py-3 shadow-2xl">
                    <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
                    <span className="text-xs font-semibold text-slate-200">
                      {isExpanding ? 'Đang tải toàn bộ dữ liệu lên giao diện...' : 'Đang cập nhật danh sách xem trước...'}
                    </span>
                  </div>
                </div>
              )}
              {/* Cảnh báo Full Path quá dài & Nút gợi ý 1-Click sửa nhanh */}
              {longPathCount > 0 && (
                <div className="m-3 mb-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 shadow-sm animate-pulse">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      Phát hiện <strong>{longPathCount} tệp tin</strong> có Full Path vượt quá 250 ký tự (nguy cơ lỗi hệ điều hành Windows).
                    </span>
                  </div>
                  <button
                    onClick={() => updateRules((r) => ({ ...r, truncate_long_path: true }))}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1 font-semibold text-white shadow transition active:scale-95 cursor-pointer"
                    title="Tự động co gọn tên file theo thuật toán cắt giữa (đầu...đuôi) để đảm bảo Full Path <= 250 ký tự"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    ⚡ Tự Động Co Gọn An Toàn (Smart Truncate)
                  </button>
                </div>
              )}

              {/* Thanh tìm kiếm và bộ lọc trạng thái */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-xs">
                {/* Search Box */}
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Tìm nhanh tệp tin trong danh sách..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1.5 text-slate-500 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Status Filter Chips */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      statusFilter === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Tất cả ({previewItems.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('renamed')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      statusFilter === 'renamed'
                        ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Đã đổi ({previewItems.filter((i) => i.status === 'renamed').length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('unchanged')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      statusFilter === 'unchanged'
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Giữ nguyên ({previewItems.filter((i) => i.status === 'unchanged').length})
                  </button>
                  {previewItems.some((i) => i.status === 'collision_resolved') && (
                    <button
                      onClick={() => setStatusFilter('collision')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                        statusFilter === 'collision'
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Xung đột ({previewItems.filter((i) => i.status === 'collision_resolved').length})
                    </button>
                  )}
                  {longPathCount > 0 && (
                    <button
                      onClick={() => setStatusFilter('long_path' as any)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                        (statusFilter as string) === 'long_path'
                          ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Đường dẫn dài ({longPathCount})
                    </button>
                  )}
                </div>

                {loading && <span className="text-indigo-400 animate-pulse text-[11px]">Đang tính toán trên RAM...</span>}
              </div>

              {/* Bảng danh sách tệp tin */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-800 bg-slate-900 text-slate-400 z-10">
                    <tr>
                      <th className="py-2.5 pl-4 pr-2 font-medium w-12">#</th>
                      <th className="px-3 py-2.5 font-medium">Tên Ban Đầu</th>
                      <th className="px-3 py-2.5 font-medium">Tên Mới Dự Kiến</th>
                      <th className="py-2.5 pl-3 pr-4 font-medium text-right w-44">Trạng Thái & Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {visibleItems.map((item, idx) => (
                      <tr key={item.id} className="transition hover:bg-slate-800/30">
                        <td className="py-2 pl-4 pr-2 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2 text-slate-300 font-sans truncate max-w-xs" title={item.path}>
                          {item.old_name}
                        </td>
                        <td className="px-3 py-2 font-medium text-indigo-300 truncate max-w-xs font-sans">
                          {item.new_name}
                        </td>
                        <td className="py-2 pl-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.is_long_path && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/30"
                                title={`Full Path dài ${item.full_path_len} ký tự! Vượt ngưỡng an toàn 250 ký tự.`}
                              >
                                ⚠️ {item.full_path_len} kt
                              </span>
                            )}

                            {item.status === 'collision_resolved' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                                <AlertTriangle className="h-3 w-3" />
                                Trùng: _1
                              </span>
                            ) : item.status === 'renamed' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" />
                                Đã đổi
                              </span>
                            ) : item.status === 'unchanged' ? (
                              <span className="inline-block rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                Giữ nguyên
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400 border border-indigo-500/20">
                                Sẵn sàng
                              </span>
                            )}

                            <button
                              onClick={() => handleOpenFolder(item.path)}
                              title="Mở trong File Explorer"
                              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-indigo-300 transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Thanh phân trang / hiển thị nhanh khi danh sách lớn */}
              {filteredItems.length > displayLimit && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/90 px-4 py-2 text-xs text-slate-400">
                  <span>
                    Đang hiển thị <strong>{visibleItems.length.toLocaleString()}</strong> / <strong>{filteredItems.length.toLocaleString()}</strong> mục (Dùng ô Tìm Kiếm để lọc tức thì).
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExpandDisplay(displayLimit + 1000)}
                      disabled={isExpanding}
                      className="rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 px-3 py-1 font-semibold text-indigo-300 transition cursor-pointer disabled:opacity-50"
                    >
                      + Xem thêm 1,000 tệp
                    </button>
                    <button
                      onClick={() => handleExpandDisplay(filteredItems.length)}
                      disabled={isExpanding}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1 text-slate-300 transition cursor-pointer disabled:opacity-50"
                    >
                      {isExpanding && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />}
                      Hiển thị tất cả
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      ) : (
        <ImageResizerView
          imageItems={imageItems}
          selectedImagePaths={selectedImagePaths}
          onToggleSelect={handleToggleSelectImage}
          onSelectAll={handleSelectAllImages}
          onDeselectAll={handleDeselectAllImages}
          onSelectOver2MB={handleSelectImagesOver2MB}
          onSelectOver1920={handleSelectImagesOver1920}
          onSelectOverTarget={handleSelectOverTarget}
          resizeConfig={resizeConfig}
          onChangeConfig={setResizeConfig}
          onRequestConfirmResize={() => setShowConfirmModal(true)}
          isResizing={isResizing}
          resizeResults={resizeResults}
          isInspecting={isInspectingImages}
          onOpenFolder={handleOpenFolder}
          onScanFolder={handleScanFolder}
          onSelectFiles={handleSelectFiles}
        />
      )}

      {/* Modal Xác Nhận Ghi Đè Nguy Hiểm */}
      <ConfirmOverwriteModal
        isOpen={showConfirmModal}
        selectedCount={selectedImagePaths.size}
        config={resizeConfig}
        onConfirm={handleExecuteResize}
        onCancel={() => setShowConfirmModal(false)}
        isResizing={isResizing}
      />

      {/* Overlay tiến độ giảm dung lượng ảnh */}
      {isResizing && resizeProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/50 bg-slate-900 p-6 shadow-2xl space-y-4 text-center">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-950/80 border border-rose-500/40">
              <Loader2 className="h-8 w-8 text-rose-400 animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Đang Giảm Kích Thước &amp; Ghi Đè Ảnh...</h3>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-xs mx-auto font-mono">
                {resizeProgress.current_file}
              </p>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-rose-600 to-amber-500 h-full transition-all duration-150"
                style={{ width: `${resizeProgress.percent}%` }}
              />
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>
                {resizeProgress.current} / {resizeProgress.total} ảnh
              </span>
              <span className="font-bold text-rose-400">{resizeProgress.percent}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
