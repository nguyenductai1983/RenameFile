import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Trash2,
  FileSpreadsheet,
  ExternalLink,
  Search,
  Sparkles,
  Replace,
  Hash,
  Type,
  Loader2,
  Image as ImageIcon,
  Settings,
  X,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { ConfirmOverwriteModal } from './components/ConfirmOverwriteModal';
import { ImageResizerView, ImageItem, ResizeResultItem } from './components/ImageResizerView';
import { ResizeConfig } from './components/ConfirmOverwriteModal';
import { AboutModal } from './components/AboutModal';

// ==========================================
// 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU (TYPES)
// ==========================================

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
  folder?: string;
  old_name: string;
  new_name: string;
  status: string;
  full_path_len?: number;
  is_collision?: boolean;
  is_long_path?: boolean;
  path_length?: number;
}

interface RenameRulesConfig {
  // Tab 1: Chuẩn Hóa
  remove_diacritics: boolean;
  clean_space: boolean;
  space_action: 'collapse' | 'trim' | 'remove_all';
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

function buildRulePayload(currentRules: RenameRulesConfig) {
  const ruleConfigs: unknown[] = [];

  // Tab 1: Chuẩn Hóa & Tiếng Việt
  if (currentRules.remove_diacritics) {
    ruleConfigs.push({ type: 'remove_vietnamese', scope: 'StemOnly' });
  }
  if (currentRules.clean_space) {
    ruleConfigs.push({
      type: 'space',
      action: currentRules.space_action,
      scope: 'StemOnly',
    });
  }
  if (currentRules.sanitize) {
    ruleConfigs.push({
      type: 'sanitize',
      replacement: currentRules.sanitize_replacement || '_',
      scope: 'FullName',
    });
  }
  if (currentRules.web_safe_slug) {
    ruleConfigs.push({
      type: 'web_safe_slug',
      separator: currentRules.slug_separator,
      scope: 'StemOnly',
    });
  }

  // Tab 2: Tìm kiếm và Thay thế
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

  // Tab 3: Tiền tố / Hậu tố & Đánh số
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

  // Tab 4: Kiểu chữ & Extension
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

  // Co gọn đường dẫn an toàn MAX_PATH (áp dụng cuối cùng)
  if (currentRules.truncate_long_path) {
    ruleConfigs.push({
      type: 'truncate_long_path',
      max_length: currentRules.max_path_length,
      use_middle: currentRules.use_middle_ellipsis,
    });
  }

  return ruleConfigs;
}

// ==========================================
// 2. COMPONENT CHÍNH (APP)
// ==========================================

export default function App() {
  // Chế độ giao diện (Theme): 'system' (theo HĐH) | 'dark' (Tối) | 'light' (Sáng)
  type ThemeMode = 'system' | 'light' | 'dark';
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('app-theme') as ThemeMode) || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark =
        themeMode === 'dark' ||
        (themeMode === 'system' && mediaQuery.matches);

      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    localStorage.setItem('app-theme', themeMode);

    const listener = () => {
      if (themeMode === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'dark';
      if (prev === 'dark') return 'light';
      return 'system';
    });
  };

  // Chế độ ứng dụng: 'renamer' (Đổi tên) | 'resizer' (Giảm dung lượng ảnh)
  const [mainMode, setMainMode] = useState<'renamer' | 'resizer'>('renamer');

  // Danh sách tệp & Kết quả xem trước đổi tên
  const [files, setFiles] = useState<string[]>([]);
  const [previewItems, setPreviewItems] = useState<FileItem[]>([]);
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isRenamed, setIsRenamed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Benchmark hiệu năng
  const [benchmarkTime, setBenchmarkTime] = useState<number>(0);
  const [benchmarkThroughput, setBenchmarkThroughput] = useState<number>(0);

  // Tab cấu hình quy tắc trong Sidebar
  const [activeTab, setActiveTab] = useState<'clean' | 'find_replace' | 'numbering' | 'case'>('clean');

  // Cấu hình quy tắc đổi tên (Rules)
  const [rules, setRules] = useState<RenameRulesConfig>({
    remove_diacritics: true,
    clean_space: true,
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
    new_extension: 'png',
  });

  // Tùy chọn phạm vi quét
  const [recursiveScan, setRecursiveScan] = useState<boolean>(true);
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [includeFolders, setIncludeFolders] = useState<boolean>(true);

  // Tìm kiếm & Lọc trong bảng
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'renamed' | 'unchanged' | 'collision' | 'long_path'>('all');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Quản lý Modal & Ảnh (Image Resizer)
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [isInspectingImages, setIsInspectingImages] = useState(false);
  const [selectedImagePaths, setSelectedImagePaths] = useState<Set<string>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState<ResizeProgressPayload | null>(null);
  const [resizeResults, setResizeResults] = useState<Record<string, ResizeResultItem>>({});
  const [resizeConfig, setResizeConfig] = useState<ResizeConfig>({
    max_width: 1920,
    max_height: 1080,
    preserve_aspect_ratio: true,
    quality: 80,
    format_mode: 'original',
  });

  // Giới hạn hiển thị Virtualized DOM
  const [displayLimit, setDisplayLimit] = useState(500);
  const [isExpanding, setIsExpanding] = useState(false);

  // ==========================================
  // 3. LOGIC XỬ LÝ (HANDLERS)
  // ==========================================

  // Cập nhật cấu hình quy tắc
  const updateRule = <K extends keyof RenameRulesConfig>(key: K, value: RenameRulesConfig[K]) => {
    setRules((prev) => ({ ...prev, [key]: value }));
  };

  // Tính toán trước danh sách đổi tên (Preview)
  const computePreview = useCallback(
    async (filePaths: string[]) => {
      if (filePaths.length === 0) {
        setPreviewItems([]);
        setBenchmarkTime(0);
        setBenchmarkThroughput(0);
        return;
      }

      try {
        setLoading(true);
        const startTime = performance.now();
        const ruleConfigs = buildRulePayload(rules);
        const results = await invoke<FileItem[]>('preview_renaming', {
          files: filePaths,
          rules: ruleConfigs,
        });

        const elapsed = Math.max(1, performance.now() - startTime);
        const throughput = Math.round((filePaths.length / (elapsed / 1000)));

        const normalized = results.map((item) => ({
          ...item,
          path_length: item.full_path_len || item.path.length,
          is_collision: item.status === 'collision_resolved',
        }));

        setPreviewItems(normalized);
        setBenchmarkTime(elapsed);
        setBenchmarkThroughput(throughput);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessage({ text: `Lỗi tính toán xem trước: ${errMsg}`, type: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [rules]
  );

  // Tự động tính lại khi tệp hoặc quy tắc thay đổi
  useEffect(() => {
    if (!isRenamed && files.length > 0) {
      computePreview(files);
    }
  }, [rules, files, isRenamed, computePreview]);

  // Quét thông tin ảnh khi danh sách tệp thay đổi
  useEffect(() => {
    const inspectImages = async () => {
      const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.gif'];
      const filtered = files.filter((f) => {
        const lower = f.toLowerCase();
        return imgExts.some((ext) => lower.endsWith(ext));
      });

      if (filtered.length === 0) {
        setImageItems([]);
        setSelectedImagePaths(new Set());
        return;
      }

      setIsInspectingImages(true);
      try {
        const inspected = await invoke<ImageItem[]>('inspect_image_files', { files: filtered });
        setImageItems(inspected);
        setSelectedImagePaths(new Set(inspected.filter((i) => i.is_valid).map((i) => i.path)));
      } catch (e) {
        console.error('Lỗi kiểm tra ảnh:', e);
      } finally {
        setIsInspectingImages(false);
      }
    };

    if (files.length > 0) {
      inspectImages();
    } else {
      setImageItems([]);
      setSelectedImagePaths(new Set());
    }
  }, [files]);

  // Lắng nghe sự kiện tiến độ quét & nén ảnh từ backend
  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    const setupListener = async () => {
      unlistenResize = await listen<ResizeProgressPayload>('image-resize-progress', (event) => {
        setResizeProgress(event.payload);
      });
    };
    setupListener();
    return () => {
      if (unlistenResize) unlistenResize();
    };
  }, []);

  // Chọn thư mục để quét
  const handleScanFolder = async () => {
    try {
      const selected = await invoke<string | null>('select_folder');
      if (!selected) return;

      setCurrentFolderPath(selected);
      setLoading(true);
      setIsRenamed(false);
      setMessage(null);

      const scanned = await invoke<string[]>('scan_selected_directory', {
        folderPath: selected,
        recursive: recursiveScan,
        includeHidden,
        includeFolders,
      });

      setFiles(scanned);
      await computePreview(scanned);

      if (scanned.length > 0) {
        setMessage({
          text: `Đã nạp thành công ${scanned.length.toLocaleString()} mục từ: ${selected}`,
          type: 'success',
        });
      } else {
        setMessage({ text: 'Thư mục trống hoặc không chứa file phù hợp.', type: 'info' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi quét thư mục: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Chọn các file riêng lẻ
  const handleSelectFiles = async () => {
    try {
      const selected = await invoke<string[] | null>('select_files');
      if (!selected || selected.length === 0) return;

      setCurrentFolderPath('');
      setIsRenamed(false);
      setFiles(selected);
      await computePreview(selected);

      setMessage({
        text: `Đã nạp thành công ${selected.length.toLocaleString()} tệp tin`,
        type: 'success',
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi chọn file: ${errMsg}`, type: 'error' });
    }
  };

  // Thay đổi tùy chọn quét (tự động quét lại nếu đang chọn thư mục)
  const handleOptionToggle = async (key: 'recursive' | 'hidden' | 'folders', val: boolean) => {
    let newRec = recursiveScan;
    let newHid = includeHidden;
    let newFol = includeFolders;

    if (key === 'recursive') {
      newRec = val;
      setRecursiveScan(val);
    } else if (key === 'hidden') {
      newHid = val;
      setIncludeHidden(val);
    } else if (key === 'folders') {
      newFol = val;
      setIncludeFolders(val);
    }

    if (currentFolderPath) {
      setLoading(true);
      try {
        const scanned = await invoke<string[]>('scan_selected_directory', {
          folderPath: currentFolderPath,
          recursive: newRec,
          includeHidden: newHid,
          includeFolders: newFol,
        });
        setFiles(scanned);
        await computePreview(scanned);
      } catch (e) {
        console.error('Lỗi quét lại:', e);
      } finally {
        setLoading(false);
      }
    }
  };

  // Bắt đầu đổi tên chính thức (Commit)
  const handleApply = async () => {
    if (previewItems.length === 0 || isRenamed) return;

    try {
      setLoading(true);
      const applied = await invoke<FileItem[]>('apply_renaming', { items: previewItems });
      const normalized = applied.map((item) => ({
        ...item,
        path_length: item.full_path_len || item.path.length,
        is_collision: item.status === 'collision_resolved',
      }));

      setPreviewItems(normalized);
      setIsRenamed(true);

      const count = normalized.filter((i) => i.status === 'renamed' || i.status === 'collision_resolved').length;
      setMessage({
        text: `🎉 Đã đổi tên thành công ${count.toLocaleString()} tệp tin trên ổ cứng!`,
        type: 'success',
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi đổi tên: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Hoàn tác (Undo / Rollback)
  const handleRollback = async () => {
    try {
      setLoading(true);
      const count = await invoke<number>('rollback_renaming');
      setMessage({ text: `↩ Đã hoàn tác (Rollback) thành công ${count} tệp tin!`, type: 'info' });

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

  // Xuất CSV báo cáo
  const handleExportCsv = async () => {
    if (previewItems.length === 0) return;
    try {
      setLoading(true);
      await invoke('export_to_csv', { exportPath: '', data: previewItems });
      setMessage({ text: 'Đã xuất danh sách báo cáo ra file CSV thành công!', type: 'success' });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Lỗi xuất CSV: ${errMsg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Lấy đường dẫn thư mục cha của tệp tin
  const getFileDir = (item: FileItem): string => {
    if (item.folder) return item.folder;
    const p = item.path || '';
    const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return lastSlash !== -1 ? p.slice(0, lastSlash) : '';
  };

  // Mở thư mục chứa file trong Windows Explorer
  const handleOpenFolder = async (path: string) => {
    try {
      await invoke('open_folder_in_os', { folderPath: path });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage({ text: `Không thể mở trong Explorer: ${errMsg}`, type: 'error' });
    }
  };

  // Xóa trắng danh sách
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

  // Tự động kích hoạt chế độ co gọn đường dẫn MAX_PATH
  const handleAutoTruncate = () => {
    setActiveTab('clean');
    updateRule('truncate_long_path', true);
    updateRule('use_middle_ellipsis', true);
    setMessage({
      text: 'Đã bật chế độ Co Gọn Full Path An Toàn (Smart Truncate Middle-Ellipsis)!',
      type: 'info',
    });
  };

  // Các thao tác chọn nhanh ảnh trong Image Resizer
  const handleSelectAllImages = () => {
    setSelectedImagePaths(new Set(imageItems.filter((i) => i.is_valid).map((i) => i.path)));
  };

  const handleDeselectAllImages = () => {
    setSelectedImagePaths(new Set());
  };

  const handleSelectImagesOver2MB = () => {
    const twoMb = 2 * 1024 * 1024;
    setSelectedImagePaths(new Set(imageItems.filter((i) => i.is_valid && i.file_size > twoMb).map((i) => i.path)));
  };

  const handleSelectImagesOver1920 = () => {
    setSelectedImagePaths(
      new Set(imageItems.filter((i) => i.is_valid && (i.width > 1920 || i.height > 1920)).map((i) => i.path))
    );
  };

  const handleSelectOverTarget = () => {
    const maxW = resizeConfig.max_width;
    const maxH = resizeConfig.max_height;
    setSelectedImagePaths(
      new Set(
        imageItems
          .filter((i) => {
            if (!i.is_valid) return false;
            const wSmaller = maxW === 0 || i.width <= maxW;
            const hSmaller = maxH === 0 || i.height <= maxH;
            return !(wSmaller && hSmaller);
          })
          .map((i) => i.path)
      )
    );
  };

  const handleToggleSelectImage = (path: string) => {
    setSelectedImagePaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Thực thi nén và ghi đè ảnh
  const handleExecuteResize = async () => {
    setShowConfirmModal(false);
    setIsResizing(true);
    setResizeProgress({ current: 0, total: selectedImagePaths.size, current_file: 'Đang chuẩn bị...', percent: 0 });

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

  // Lọc bảng theo từ khóa tìm kiếm & trạng thái
  const filteredItems = useMemo(() => {
    return previewItems.filter((item) => {
      if (statusFilter === 'renamed' && item.status !== 'renamed') return false;
      if (statusFilter === 'unchanged' && item.status !== 'unchanged') return false;
      if (statusFilter === 'collision' && item.status !== 'collision_resolved') return false;
      if (statusFilter === 'long_path' && !item.is_long_path) return false;

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

  const longPathCount = useMemo(() => {
    return previewItems.filter((i) => i.is_long_path).length;
  }, [previewItems]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, displayLimit);
  }, [filteredItems, displayLimit]);

  const handleExpandDisplay = (targetLimit: number) => {
    setIsExpanding(true);
    setTimeout(() => {
      setDisplayLimit(targetLimit);
      requestAnimationFrame(() => {
        setTimeout(() => setIsExpanding(false), 50);
      });
    }, 50);
  };

  // ==========================================
  // 4. GIAO DIỆN CHÍNH (JSX LAYOUT)
  // ==========================================

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 dark:bg-black font-sans text-slate-800 dark:text-slate-100 antialiased select-none">
      {/* ========================================================================= */}
      {/* VÙNG 1: THANH ĐIỀU HƯỚNG TRÊN CÙNG (TOP NAVIGATION BAR - macOS / Win 11)   */}
      {/* ========================================================================= */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-neutral-800 bg-white/95 dark:bg-black/95 px-6 backdrop-blur-md shadow-xs z-20">
        {/* Brand Logo & Version */}
        <div
          onClick={() => setShowAboutModal(true)}
          className="flex items-center gap-3 cursor-pointer group"
          title="Bấm để xem giới thiệu & cập nhật phần mềm"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-all duration-200">
            <span className="text-xl">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200">
                Rename File Viet
              </h1>
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 font-mono">
                v1.0.0
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Tiện ích đổi tên tệp tiếng Việt &amp; nén ảnh hàng loạt</p>
          </div>
        </div>

        {/* Chuyển Đổi Chế Độ (Mode Switcher Pills) */}
        <div className="flex items-center rounded-xl bg-slate-100 dark:bg-neutral-900 p-1 border border-slate-200/80 dark:border-neutral-800 shadow-inner">
          <button
            type="button"
            onClick={() => setMainMode('renamer')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${mainMode === 'renamer'
              ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>🏷️ Đổi Tên Tệp</span>
            {previewItems.length > 0 && (
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-mono font-bold">
                {previewItems.length.toLocaleString()}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainMode('resizer')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${mainMode === 'resizer'
              ? 'bg-white dark:bg-neutral-800 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>🖼️ Giảm Kích Thước Ảnh</span>
            {imageItems.length > 0 && (
              <span className="rounded-full bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 px-2 py-0.5 text-[10px] font-mono font-bold">
                {imageItems.length.toLocaleString()} ảnh
              </span>
            )}
          </button>
        </div>

        {/* Nút Điều Khiển: Chế độ Sáng/Tối & Giới Thiệu / Cập Nhật GitHub */}
        <div className="flex items-center gap-2">
          {/* Nút chuyển đổi giao diện Sáng / Tối / Hệ điều hành */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition-all duration-200 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-neutral-800 active:scale-95 cursor-pointer"
            title={
              themeMode === 'system'
                ? 'Chế độ hiện tại: Theo Hệ Điều Hành (Bấm để chuyển sang Tối)'
                : themeMode === 'dark'
                  ? 'Chế độ hiện tại: Tối (Bấm để chuyển sang Sáng)'
                  : 'Chế độ hiện tại: Sáng (Bấm để chuyển sang Theo Hệ Điều Hành)'
            }
          >
            {themeMode === 'system' ? (
              <>
                <Monitor className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                <span className="hidden sm:inline">Theo HĐH</span>
              </>
            ) : themeMode === 'dark' ? (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Tối</span>
              </>
            ) : (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">Sáng</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowAboutModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition-all duration-200 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-neutral-800 active:scale-95 cursor-pointer"
            title="Xem giới thiệu phần mềm & tải bản cập nhật mới nhất từ GitHub"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="hidden sm:inline">Giới Thiệu &amp; Cập Nhật</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* VÙNG 2: THANH THAO TÁC & THÔNG TIN THƯ MỤC (SUB-HEADER)                  */}
      {/* ========================================================================= */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-black px-6 text-xs text-slate-600 dark:text-slate-400 shadow-2xs z-10">
        {/* Bên trái: Thông tin Thư mục hiện tại */}
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-4">
          <FolderOpen className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span className="shrink-0 font-medium text-slate-500 dark:text-slate-400">Thư mục:</span>
          {currentFolderPath ? (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="truncate font-mono text-indigo-700 dark:text-indigo-300 bg-slate-100 dark:bg-neutral-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-neutral-800 shadow-2xs max-w-xs sm:max-w-md md:max-w-xl font-medium"
                title={currentFolderPath}
              >
                {currentFolderPath}
              </span>
              <button
                onClick={() => handleOpenFolder(currentFolderPath)}
                className="shrink-0 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                title="Mở thư mục trong Windows Explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentFolderPath('');
                  setFiles([]);
                  setPreviewItems([]);
                }}
                className="shrink-0 text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors underline ml-1 cursor-pointer"
                title="Bỏ chọn thư mục"
              >
                Đóng
              </button>
            </div>
          ) : (
            <span className="italic text-slate-400 dark:text-slate-500 truncate">
              {files.length > 0
                ? `(Đang chọn ${files.length.toLocaleString()} tệp tin riêng lẻ)`
                : 'Chưa chọn thư mục (Chọn hoặc kéo thả vào khung bên dưới)'}
            </span>
          )}
        </div>

        {/* Bên phải: Nhóm Nút Thao Tác Chính (Bắt Đầu Đổi Tên, Hoàn Tác, CSV, Xóa danh sách) */}
        {mainMode === 'renamer' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleApply}
              disabled={files.length === 0 || loading || isRenamed}
              className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-200 active:scale-95 cursor-pointer ${isRenamed
                  ? 'bg-slate-400 dark:bg-neutral-800 cursor-not-allowed opacity-70'
                  : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>{isRenamed ? '✔ Đã Đổi Tên Xong' : 'Bắt Đầu Đổi Tên'}</span>
            </button>

            <button
              onClick={handleRollback}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all duration-200 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:text-amber-600 dark:hover:text-amber-400 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Hoàn tác (Undo) phiên đổi tên trước"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              <span>Hoàn Tác</span>
            </button>

            {previewItems.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all duration-200 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 cursor-pointer"
                title="Xuất báo cáo đổi tên ra CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                <span>CSV</span>
              </button>
            )}

            {files.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1.5 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:border-rose-800 transition-all duration-200 cursor-pointer shadow-2xs"
                title="Xóa danh sách"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VÙNG 3: KHÔNG GIAN LÀM VIỆC CHÍNH (MAIN WORKSPACE: SIDEBAR + CONTENT)      */}
      {/* ========================================================================= */}
      {mainMode === 'renamer' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* --------------------------------------------------------------------- */}
          {/* CỘT BÊN TRÁI: SIDEBAR (QUẢN LÝ QUY TẮC & CÀI ĐẶT)                    */}
          {/* --------------------------------------------------------------------- */}
          <aside className="w-80 sm:w-88 shrink-0 border-r border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-black flex flex-col justify-between overflow-hidden shadow-xs">
            {/* Phía trên Sidebar: Danh sách Quy Tắc (Cards) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Header Sidebar & Tab Selector */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quy Tắc Đổi Tên</span>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-800/50">
                    Đa luồng Rayon
                  </span>
                </div>

                {/* Tab Buttons Pills */}
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 dark:bg-neutral-900 p-1 border border-slate-200/70 dark:border-neutral-800">
                  <button
                    onClick={() => setActiveTab('clean')}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${activeTab === 'clean'
                      ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 mb-1" />
                    <span>Chuẩn Hóa</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('find_replace')}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${activeTab === 'find_replace'
                      ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    <Replace className="h-3.5 w-3.5 mb-1" />
                    <span>Tìm &amp; Thay</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('numbering')}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${activeTab === 'numbering'
                      ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    <Hash className="h-3.5 w-3.5 mb-1" />
                    <span>Đánh Số</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('case')}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${activeTab === 'case'
                      ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    <Type className="h-3.5 w-3.5 mb-1" />
                    <span>Chữ &amp; Đuôi</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: CHUẨN HÓA & TIẾNG VIỆT */}
              {activeTab === 'clean' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Card 1: Xóa Dấu Tiếng Việt */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.remove_diacritics}
                        onChange={(e) => updateRule('remove_diacritics', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Xóa Dấu Tiếng Việt</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Chuyển tiếng Việt có dấu sang không dấu chuẩn Unicode (NFD/NFC, Đ/đ → D/d)
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Card 2: Xử Lý Khoảng Trắng */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.clean_space}
                        onChange={(e) => updateRule('clean_space', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Xử Lý Khoảng Trắng</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Loại bỏ dấu cách thừa ở đầu, cuối và giữa tên</p>
                      </div>
                    </label>

                    {rules.clean_space && (
                      <div className="pl-6 space-y-1 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-neutral-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="space_action"
                            checked={rules.space_action === 'collapse'}
                            onChange={() => updateRule('space_action', 'collapse')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Dồn nhiều khoảng trắng liên tiếp → 1</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="space_action"
                            checked={rules.space_action === 'trim'}
                            onChange={() => updateRule('space_action', 'trim')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Chỉ cắt bỏ khoảng trắng ở 2 đầu</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="space_action"
                            checked={rules.space_action === 'remove_all'}
                            onChange={() => updateRule('space_action', 'remove_all')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Xóa tất cả khoảng trắng trong tên</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Card 3: Làm Sạch Ký Tự Cấm OS */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.sanitize}
                        onChange={(e) => updateRule('sanitize', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Làm Sạch Ký Tự Cấm OS</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Tự động thay thế các ký tự cấm: \ / : * ? &quot; &lt; &gt; |
                        </p>
                      </div>
                    </label>

                    {rules.sanitize && (
                      <div className="pl-6 pt-1 flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Thay thế bằng:</span>
                        <input
                          type="text"
                          value={rules.sanitize_replacement}
                          onChange={(e) => updateRule('sanitize_replacement', e.target.value)}
                          maxLength={2}
                          className="w-12 rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1 text-center text-xs font-mono font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Card 4: Web-safe Slug */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.web_safe_slug}
                        onChange={(e) => updateRule('web_safe_slug', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Chuẩn Hóa Web Slug</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Chữ thường, chỉ gồm a-z, 0-9 và dấu gạch nối</p>
                      </div>
                    </label>

                    {rules.web_safe_slug && (
                      <div className="pl-6 pt-1 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="slug_sep"
                            checked={rules.slug_separator === '-'}
                            onChange={() => updateRule('slug_separator', '-')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Gạch ngang (-)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="slug_sep"
                            checked={rules.slug_separator === '_'}
                            onChange={() => updateRule('slug_separator', '_')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Gạch dưới (_)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Card 5: Co Gọn Full Path An Toàn (MAX_PATH) */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.truncate_long_path}
                        onChange={(e) => updateRule('truncate_long_path', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Co Gọn Full Path (MAX_PATH)</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Tự động cắt bớt tên file nếu đường dẫn dài vượt quá 250 ký tự
                        </p>
                      </div>
                    </label>

                    {rules.truncate_long_path && (
                      <div className="pl-6 space-y-2 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Giới hạn tối đa:</span>
                          <input
                            type="number"
                            value={rules.max_path_length}
                            onChange={(e) => updateRule('max_path_length', parseInt(e.target.value) || 250)}
                            className="w-16 rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1 text-center text-xs font-mono font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                          />
                          <span className="text-[11px] text-slate-400">ký tự</span>
                        </div>
                        <div className="space-y-1">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="trunc_mode"
                              checked={rules.use_middle_ellipsis}
                              onChange={() => updateRule('use_middle_ellipsis', true)}
                              className="text-indigo-600 focus:ring-0 cursor-pointer"
                            />
                            <span>Cắt ở giữa giữ đầu &amp; đuôi (...)</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="trunc_mode"
                              checked={!rules.use_middle_ellipsis}
                              onChange={() => updateRule('use_middle_ellipsis', false)}
                              className="text-indigo-600 focus:ring-0 cursor-pointer"
                            />
                            <span>Cắt ở cuối tên file</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TÌM KIẾM & THAY THẾ */}
              {activeTab === 'find_replace' && (
                <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-3 animate-in fade-in duration-200">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rules.find_replace}
                      onChange={(e) => updateRule('find_replace', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Bật Tìm &amp; Thay Thế</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Hỗ trợ từ khóa chính xác hoặc Regex nâng cao</p>
                    </div>
                  </label>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Tìm (Find):</label>
                      <input
                        type="text"
                        value={rules.find_text}
                        onChange={(e) => updateRule('find_text', e.target.value)}
                        placeholder="Từ khóa hoặc biểu thức Regex..."
                        className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Thay bằng (Replace):</label>
                      <input
                        type="text"
                        value={rules.replace_text}
                        onChange={(e) => updateRule('replace_text', e.target.value)}
                        placeholder="Chuỗi mới thay thế..."
                        className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5 pt-1 text-slate-600 dark:text-slate-300">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rules.find_regex}
                          onChange={(e) => updateRule('find_regex', e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Sử dụng Regex (Biểu thức chính quy)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rules.find_match_case}
                          onChange={(e) => updateRule('find_match_case', e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Phân biệt chữ HOA / thường</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TIỀN TỐ/HẬU TỐ & ĐÁNH SỐ THỨ TỰ */}
              {activeTab === 'numbering' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Tiền tố / Hậu tố */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.prefix_suffix}
                        onChange={(e) => updateRule('prefix_suffix', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Thêm Tiền Tố &amp; Hậu Tố</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Chèn chuỗi ký tự vào đầu hoặc cuối tên tệp</p>
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Tiền tố (Prefix):</label>
                        <input
                          type="text"
                          value={rules.prefix_text}
                          onChange={(e) => updateRule('prefix_text', e.target.value)}
                          placeholder="vd: HinhAnh_"
                          className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Hậu tố (Suffix):</label>
                        <input
                          type="text"
                          value={rules.suffix_text}
                          onChange={(e) => updateRule('suffix_text', e.target.value)}
                          placeholder="vd: _BanChinh"
                          className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Đánh Số Thứ Tự */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.numbering}
                        onChange={(e) => updateRule('numbering', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Đánh Số Tuần Tự (001, 002...)</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tự động tăng số tuần tự cho từng file</p>
                      </div>
                    </label>

                    <div className="space-y-2 text-xs pt-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400">Bắt đầu:</label>
                          <input
                            type="number"
                            value={rules.numbering_start}
                            onChange={(e) => updateRule('numbering_start', parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-1.5 py-1 text-center text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400">Bước nhảy:</label>
                          <input
                            type="number"
                            value={rules.numbering_step}
                            onChange={(e) => updateRule('numbering_step', parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-1.5 py-1 text-center text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400">Số chữ số:</label>
                          <input
                            type="number"
                            value={rules.numbering_padding}
                            onChange={(e) => updateRule('numbering_padding', parseInt(e.target.value) || 3)}
                            className="w-full rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-1.5 py-1 text-center text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="num_pos"
                            checked={rules.numbering_position === 'suffix'}
                            onChange={() => updateRule('numbering_position', 'suffix')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Chèn ở cuối tên (vd: Anh_001)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="num_pos"
                            checked={rules.numbering_position === 'prefix'}
                            onChange={() => updateRule('numbering_position', 'prefix')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Chèn ở đầu tên (vd: 001_Anh)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="num_pos"
                            checked={rules.numbering_position === 'replace_all'}
                            onChange={() => updateRule('numbering_position', 'replace_all')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Thay thế hoàn toàn bằng tiền tố + số</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Ký tự ngăn cách:</span>
                        <input
                          type="text"
                          value={rules.numbering_custom_text}
                          onChange={(e) => updateRule('numbering_custom_text', e.target.value)}
                          className="w-16 rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1 text-center text-xs font-mono font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: KIỂU CHỮ & ĐUÔI MỞ RỘNG */}
              {activeTab === 'case' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Đổi kiểu chữ */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.case_transform}
                        onChange={(e) => updateRule('case_transform', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Đổi Định Dạng Chữ</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Biến đổi chữ hoa, chữ thường, viết hoa đầu từ</p>
                      </div>
                    </label>

                    {rules.case_transform && (
                      <div className="pl-6 space-y-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-neutral-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="case_type"
                            checked={rules.case_type === 'title'}
                            onChange={() => updateRule('case_type', 'title')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Title Case (Viết Hoa Chữ Đầu Từ)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="case_type"
                            checked={rules.case_type === 'sentence'}
                            onChange={() => updateRule('case_type', 'sentence')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>Sentence case (Viết hoa chữ đầu câu)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="case_type"
                            checked={rules.case_type === 'upper'}
                            onChange={() => updateRule('case_type', 'upper')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>UPPERCASE (VIẾT HOA TOÀN BỘ)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="case_type"
                            checked={rules.case_type === 'lower'}
                            onChange={() => updateRule('case_type', 'lower')}
                            className="text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          <span>lowercase (viết thường toàn bộ)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Đổi Đuôi Mở Rộng */}
                  <div className="rounded-xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.change_extension}
                        onChange={(e) => updateRule('change_extension', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">Đổi Đuôi Mở Rộng (Extension)</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Thay đổi phần mở rộng tệp tin hàng loạt</p>
                      </div>
                    </label>

                    {rules.change_extension && (
                      <div className="pl-6 pt-1 flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Đuôi mới:</span>
                        <input
                          type="text"
                          value={rules.new_extension}
                          onChange={(e) => updateRule('new_extension', e.target.value)}
                          placeholder="png"
                          className="w-20 rounded-lg border border-slate-300 dark:border-neutral-800 bg-white dark:bg-black px-2 py-1 text-center text-xs font-mono font-bold text-slate-800 dark:text-slate-100 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Phía dưới Sidebar: Cài Đặt Phạm Vi Quét & Benchmark */}
            <div className="border-t border-slate-200/80 dark:border-neutral-800 bg-slate-50/80 dark:bg-black p-4 space-y-3">
              {/* Settings Card */}
              <div className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] p-3 space-y-2 shadow-2xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  <Settings className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>CÀI ĐẶT PHẠM VI QUÉT</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white transition">
                    <input
                      type="checkbox"
                      checked={recursiveScan}
                      onChange={(e) => handleOptionToggle('recursive', e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Quét sâu thư mục con (Recursive)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white transition">
                    <input
                      type="checkbox"
                      checked={includeFolders}
                      onChange={(e) => handleOptionToggle('folders', e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Đổi tên cả Thư mục (Folder)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white transition">
                    <input
                      type="checkbox"
                      checked={includeHidden}
                      onChange={(e) => handleOptionToggle('hidden', e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 dark:bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Bao gồm cả tệp &amp; thư mục ẩn</span>
                  </label>
                </div>
              </div>

              {/* Benchmark Widget */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 font-mono">
                <span>⚡ {benchmarkTime.toFixed(1)} ms</span>
                <span>{benchmarkThroughput.toLocaleString()} tệp/giây</span>
              </div>
            </div>
          </aside>

          {/* --------------------------------------------------------------------- */}
          {/* KHU VỰC CHÍNH (MAIN CONTENT - BẢNG XEM TRƯỚC / DROPZONE)               */}
          {/* --------------------------------------------------------------------- */}
          <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-black">
            {/* Thanh Tìm Kiếm & Bộ Lọc Nhanh (chỉ hiển thị khi đã nạp tệp tin) */}

            {files.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-neutral-800 bg-slate-50/90 dark:bg-black px-6 py-2.5 text-xs">
                {/* Ô Tìm kiếm */}
                <div className="relative w-72">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm theo tên file..."
                    className="w-full rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-9 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Các Chip Lọc Trạng Thái */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-all duration-200 cursor-pointer ${statusFilter === 'all'
                      ? 'bg-slate-800 dark:bg-neutral-800 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-neutral-900'
                      }`}
                  >
                    Tất cả ({previewItems.length.toLocaleString()})
                  </button>
                  <button
                    onClick={() => setStatusFilter('renamed')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-all duration-200 cursor-pointer ${statusFilter === 'renamed'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      }`}
                  >
                    Đã đổi
                  </button>
                  <button
                    onClick={() => setStatusFilter('unchanged')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-all duration-200 cursor-pointer ${statusFilter === 'unchanged'
                      ? 'bg-slate-600 dark:bg-neutral-800 text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-neutral-900'
                      }`}
                  >
                    Giữ nguyên
                  </button>
                  <button
                    onClick={() => setStatusFilter('collision')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-all duration-200 cursor-pointer ${statusFilter === 'collision'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                      }`}
                  >
                    Trùng: _1
                  </button>
                  {longPathCount > 0 && (
                    <button
                      onClick={() => setStatusFilter('long_path')}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition-all duration-200 cursor-pointer ${statusFilter === 'long_path'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                        }`}
                    >
                      ⚠️ Dài &gt; 250 ({longPathCount})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Thông báo Banner trạng thái */}
            {message && (
              <div
                className={`flex items-center justify-between px-6 py-2.5 text-xs font-medium border-b animate-in fade-in duration-150 ${message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : message.type === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  }`}
              >
                <span>{message.text}</span>
                <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Cảnh báo đường dẫn quá dài kèm nút 1-Click Auto Fix */}
            {longPathCount > 0 && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-6 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Phát hiện <strong>{longPathCount} tệp</strong> có Full Path &gt; 250 ký tự có thể gặp lỗi trên Windows cũ.
                  </span>
                </div>
                <button
                  onClick={handleAutoTruncate}
                  className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white shadow-2xs hover:bg-amber-500 transition cursor-pointer"
                >
                  ⚡ Tự Động Co Gọn An Toàn
                </button>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VÙNG CHỨA BẢNG XEM TRƯỚC HOẶC KHUNG EMPTY STATE (DROPZONE)        */}
            {/* ----------------------------------------------------------------- */}
            <div className="flex-1 overflow-hidden relative">
              {files.length === 0 ? (
                /* KHUNG TRỐNG (EMPTY STATE / DROPZONE) */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  className={`h-full flex flex-col items-center justify-center p-8 transition-all duration-200 ${isDragging ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-2 border-dashed border-indigo-500' : ''
                    }`}
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100/80 dark:border-indigo-800/60 shadow-md shadow-indigo-100 dark:shadow-none mb-5">
                    <FolderPlus className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
                  </div>

                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1.5">
                    Kéo thả thư mục vào đây hoặc bấm nút Chọn
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md text-center leading-relaxed mb-6">
                    Hỗ trợ quét đệ quy hàng trăm nghìn tệp tin, chuẩn hóa tiếng Việt, xử lý đường dẫn dài và nén ảnh tốc độ cao.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleScanFolder}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 hover:bg-indigo-500 active:scale-95 cursor-pointer"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span>Chọn Thư Mục</span>
                    </button>
                    <button
                      onClick={handleSelectFiles}
                      className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all duration-200 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-slate-400 dark:hover:border-slate-600 active:scale-95 cursor-pointer"
                    >
                      <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span>Chọn Tệp Tin</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* BẢNG DANH SÁCH FILE XEM TRƯỚC (CLEAN TABLE) */
                <div className="h-full overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-4 w-1/4">Tên Ban Đầu</th>
                        <th className="py-3 px-4 w-1/4">Tên Mới Dự Kiến</th>
                        <th className="py-3 px-4 w-1/3">Thư Mục (Bấm để mở)</th>
                        <th className="py-3 px-2 w-24 text-center">Độ Dài Path</th>
                        <th className="py-3 px-4 w-32 text-center">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-neutral-850 bg-white dark:bg-black">
                      {visibleItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/25 transition-colors duration-150">
                          {/* Index */}
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 dark:text-slate-500 text-[11px]">{idx + 1}</td>

                          {/* Old Name */}
                          <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200 break-all">{item.old_name}</td>

                          {/* New Name */}
                          <td className="py-2.5 px-4 break-all">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{item.new_name}</span>
                          </td>

                          {/* Folder Directory với Thao Tác Mở Thư Mục Tích Hợp */}
                          <td className="py-2.5 px-4 max-w-[260px]">
                            <button
                              type="button"
                              onClick={() => handleOpenFolder(item.path)}
                              className="group/folder flex items-center gap-1.5 w-full text-left font-mono text-xs text-slate-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 -m-1 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-all cursor-pointer"
                              title={`Bấm để mở thư mục trong File Explorer:\n${getFileDir(item)}`}
                            >
                              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80 group-hover/folder:text-amber-500 transition-colors" />
                              <span className="truncate flex-1 underline decoration-dotted decoration-slate-300 dark:decoration-neutral-700 underline-offset-2 group-hover/folder:decoration-indigo-500">
                                {getFileDir(item)}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/folder:opacity-100 text-indigo-500 transition-opacity" />
                            </button>
                          </td>

                          {/* Path Length Badge */}
                          <td className="py-2.5 px-2 text-center">
                            <div className="inline-flex items-center gap-1 font-mono text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400">{item.path_length}</span>
                              {item.is_long_path && (
                                <span className="rounded-full bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 px-1.5 py-0.2 text-[9px] font-bold text-rose-600 dark:text-rose-400">
                                  Dài
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-4 text-center">
                            {item.status === 'renamed' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Đã đổi
                              </span>
                            ) : item.status === 'collision_resolved' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                <AlertCircle className="h-3 w-3" />
                                Trùng: _1
                              </span>
                            ) : item.status === 'unchanged' ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 px-2.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                Giữ nguyên
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                                Sẵn sàng
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Thanh phân trang hiển thị khi danh sách lớn */}
                  {filteredItems.length > displayLimit && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-black px-6 py-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Đang hiển thị <strong>{visibleItems.length.toLocaleString()}</strong> /{' '}
                        <strong>{filteredItems.length.toLocaleString()}</strong> mục.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExpandDisplay(displayLimit + 1000)}
                          disabled={isExpanding}
                          className="rounded-lg bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 px-3 py-1 font-semibold text-indigo-600 dark:text-indigo-300 transition cursor-pointer"
                        >
                          + Xem thêm 1,000 tệp
                        </button>
                        <button
                          onClick={() => handleExpandDisplay(filteredItems.length)}
                          disabled={isExpanding}
                          className="rounded-lg bg-slate-200/80 dark:bg-neutral-900 hover:bg-slate-300 dark:hover:bg-neutral-800 px-3 py-1 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer"
                        >
                          {isExpanding && <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />}
                          Hiển thị tất cả
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Bar */}
            <div className="flex h-8 shrink-0 items-center justify-between border-t border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-black px-6 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Sẵn sàng: {filteredItems.length.toLocaleString()} tệp tin</span>
              <span className="font-mono">Rust Tauri v2 • React 18 + Tailwind CSS</span>
            </div>
          </main>
        </div>
      ) : (
        /* ========================================================================= */
        /* CHẾ ĐỘ GIẢM KÍCH THƯỚC ẢNH (IMAGE RESIZER VIEW)                           */
        /* ========================================================================= */
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

      {/* ========================================================================= */}
      {/* CÁC MODAL HỘP THOẠI XÁC NHẬN & THÔNG TIN                                  */}
      {/* ========================================================================= */}

      {/* Modal Xác Nhận Ghi Đè Nguy Hiểm */}
      <ConfirmOverwriteModal
        isOpen={showConfirmModal}
        selectedCount={selectedImagePaths.size}
        config={resizeConfig}
        onConfirm={handleExecuteResize}
        onCancel={() => setShowConfirmModal(false)}
        isResizing={isResizing}
      />

      {/* Modal Giới Thiệu & Cập Nhật GitHub */}
      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />

      {/* Overlay Tiến Độ Giảm Dung Lượng Ảnh Đa Luồng */}
      {isResizing && resizeProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-neutral-800 bg-white dark:bg-black p-6 shadow-2xl space-y-4 text-center">
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60">
              <Loader2 className="h-7 w-7 text-rose-600 dark:text-rose-400 animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Đang Giảm Kích Thước &amp; Ghi Đè Ảnh...</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 truncate max-w-xs mx-auto font-mono">
                {resizeProgress.current_file}
              </p>
            </div>

            <div className="w-full bg-slate-100 dark:bg-neutral-900 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-rose-600 to-indigo-600 h-full transition-all duration-150"
                style={{ width: `${resizeProgress.percent}%` }}
              />
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-500 dark:text-zinc-400">
              <span>
                {resizeProgress.current} / {resizeProgress.total} ảnh
              </span>
              <span className="font-bold text-rose-600 dark:text-rose-400">{resizeProgress.percent}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
