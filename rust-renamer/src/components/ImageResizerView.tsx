import React, { useState, useMemo } from 'react';
import {
  Image as ImageIcon,
  Sliders,
  AlertTriangle,
  Flame,
  Search,
  ExternalLink,
  CheckCircle2,
  FolderOpen,
  FileText,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { ResizeConfig } from './ConfirmOverwriteModal';

export interface ImageItem {
  path: string;
  file_name: string;
  width: number;
  height: number;
  file_size: number;
  format: string;
  is_valid: boolean;
}

export interface ResizeResultItem {
  path: string;
  original_size: number;
  new_size: number;
  original_width: number;
  original_height: number;
  new_width: number;
  new_height: number;
  success: boolean;
  skipped?: boolean;
  skip_reason?: string;
  error_message?: string;
}

interface ImageResizerViewProps {
  imageItems: ImageItem[];
  selectedImagePaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectOver2MB: () => void;
  onSelectOver1920: () => void;
  onSelectOverTarget: () => void;
  resizeConfig: ResizeConfig;
  onChangeConfig: (updater: (prev: ResizeConfig) => ResizeConfig) => void;
  onRequestConfirmResize: () => void;
  isResizing: boolean;
  resizeResults: Record<string, ResizeResultItem>;
  isInspecting: boolean;
  onOpenFolder: (path: string) => void;
  onScanFolder: () => void;
  onSelectFiles: () => void;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] || 'MB'}`;
}

function calculateNewDims(
  origW: number,
  origH: number,
  maxW: number,
  maxH: number,
  preserve: boolean
): [number, number] {
  if (origW === 0 || origH === 0) return [origW, origH];
  if (!preserve) {
    return [maxW > 0 ? maxW : origW, maxH > 0 ? maxH : origH];
  }
  if ((maxW === 0 || origW <= maxW) && (maxH === 0 || origH <= maxH)) {
    return [origW, origH];
  }
  const ratioW = maxW > 0 ? maxW / origW : 1;
  const ratioH = maxH > 0 ? maxH / origH : 1;
  const scale = Math.min(ratioW, ratioH);
  return [Math.max(1, Math.round(origW * scale)), Math.max(1, Math.round(origH * scale))];
}

export const ImageResizerView: React.FC<ImageResizerViewProps> = ({
  imageItems,
  selectedImagePaths,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectOver2MB,
  onSelectOver1920,
  onSelectOverTarget,
  resizeConfig,
  onChangeConfig,
  onRequestConfirmResize,
  isResizing,
  resizeResults,
  isInspecting,
  onOpenFolder,
  onScanFolder,
  onSelectFiles,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'JPG' | 'PNG' | 'WEBP'>('all');

  // Lọc ảnh theo tìm kiếm và định dạng
  const filteredImages = useMemo(() => {
    return imageItems.filter((img) => {
      if (formatFilter !== 'all') {
        const fmt = img.format.toUpperCase();
        if (formatFilter === 'JPG' && fmt !== 'JPG' && fmt !== 'JPEG') return false;
        if (formatFilter === 'PNG' && fmt !== 'PNG') return false;
        if (formatFilter === 'WEBP' && fmt !== 'WEBP') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return img.file_name.toLowerCase().includes(q) || img.path.toLowerCase().includes(q);
      }
      return true;
    });
  }, [imageItems, searchQuery, formatFilter]);

  // Thống kê dung lượng đã chọn
  const selectedBytes = useMemo(() => {
    return imageItems
      .filter((i) => selectedImagePaths.has(i.path))
      .reduce((sum, i) => sum + i.file_size, 0);
  }, [imageItems, selectedImagePaths]);

  const allFilteredSelected = useMemo(() => {
    if (filteredImages.length === 0) return false;
    return filteredImages.every((i) => selectedImagePaths.has(i.path));
  }, [filteredImages, selectedImagePaths]);

  const handleToggleSelectFiltered = () => {
    if (allFilteredSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  const setPreset = (w: number, h: number) => {
    onChangeConfig((prev) => ({
      ...prev,
      max_width: w,
      max_height: h,
    }));
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* CỘT TRÁI: CẤU HÌNH THU NHỎ & NÉN */}
      <aside className="w-88 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col overflow-y-auto">
        <div className="border-b border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
            <Sliders className="h-4 w-4" />
            <span>⚙️ THIẾT LẬP THU NHỎ &amp; NÉN</span>
          </div>
          <p className="text-[11px] text-slate-400">Điều chỉnh độ phân giải và chất lượng ảnh</p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Mục 1: Kích thước tối đa & Presets */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Maximize2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Độ Phân Giải Tối Đa (Max Pixels)</span>
            </div>

            {/* Presets nhanh */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setPreset(1920, 1080)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  resizeConfig.max_width === 1920 && resizeConfig.max_height === 1080
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Full HD (1920×1080)
              </button>
              <button
                type="button"
                onClick={() => setPreset(2560, 1440)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  resizeConfig.max_width === 2560 && resizeConfig.max_height === 1440
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                2K QHD (2560×1440)
              </button>
              <button
                type="button"
                onClick={() => setPreset(1280, 720)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  resizeConfig.max_width === 1280 && resizeConfig.max_height === 720
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                HD 720p (1280×720)
              </button>
              <button
                type="button"
                onClick={() => setPreset(1024, 768)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  resizeConfig.max_width === 1024 && resizeConfig.max_height === 768
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Web (1024×768)
              </button>
            </div>

            {/* Custom Inputs */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div>
                <span className="block text-slate-400 mb-1">Rộng tối đa (W):</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={resizeConfig.max_width}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        max_width: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-slate-500">px</span>
                </div>
              </div>
              <div>
                <span className="block text-slate-400 mb-1">Cao tối đa (H):</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={resizeConfig.max_height}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        max_height: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-slate-500">px</span>
                </div>
              </div>
            </div>

            {/* Checkbox Aspect Ratio */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={resizeConfig.preserve_aspect_ratio}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    preserve_aspect_ratio: e.target.checked,
                  }))
                }
                className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0"
              />
              <span className="text-xs text-slate-300 font-medium select-none">
                Giữ nguyên tỉ lệ khung hình (Khuyên dùng)
              </span>
            </label>
          </div>

          {/* Mục 2: Chất lượng nén */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200">Chất Lượng Nén (Quality):</span>
              <span className="font-mono text-rose-400 font-bold">{resizeConfig.quality}%</span>
            </div>

            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={resizeConfig.quality}
              onChange={(e) =>
                onChangeConfig((prev) => ({
                  ...prev,
                  quality: parseInt(e.target.value) || 80,
                }))
              }
              className="w-full accent-rose-500 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-slate-400">
              <span>10% (Siêu nhẹ)</span>
              <span className="text-emerald-400 font-medium">80% (Khuyên dùng)</span>
              <span>100% (Gốc)</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Mức 75% - 85% cho chất lượng mắt thường khó phân biệt nhưng giảm tới 60-80% dung lượng tệp tin.
            </p>
          </div>

          {/* Mục 3: Định dạng xuất */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-2">
            <span className="block text-xs font-semibold text-slate-200">Định Dạng Tệp Tin Xuất:</span>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="radio"
                  name="format_mode"
                  checked={resizeConfig.format_mode === 'original'}
                  onChange={() => onChangeConfig((p) => ({ ...p, format_mode: 'original' }))}
                  className="text-rose-600"
                />
                <span>Giữ nguyên định dạng gốc (JPG, PNG, WebP)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="radio"
                  name="format_mode"
                  checked={resizeConfig.format_mode === 'webp'}
                  onChange={() => onChangeConfig((p) => ({ ...p, format_mode: 'webp' }))}
                  className="text-rose-600"
                />
                <span>Chuyển sang WebP (Nén cực nhẹ cho Web)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="radio"
                  name="format_mode"
                  checked={resizeConfig.format_mode === 'jpeg'}
                  onChange={() => onChangeConfig((p) => ({ ...p, format_mode: 'jpeg' }))}
                  className="text-rose-600"
                />
                <span>Chuyển sang JPEG (Tương thích tốt nhất)</span>
              </label>
            </div>
          </div>

          {/* Thẻ Cảnh báo ĐỎ (Ghi đè) */}
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3.5 text-xs text-rose-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              <span>CHẾ ĐỘ: GHI ĐÈ FILE GỐC</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-300/90">
              Các hình ảnh được chọn sẽ bị thu nhỏ và thay thế trực tiếp vào tệp gốc trên ổ cứng. Thao tác không thể hoàn tác.
            </p>
          </div>

          {/* Nút thực thi chính */}
          <button
            type="button"
            disabled={selectedImagePaths.size === 0 || isResizing}
            onClick={onRequestConfirmResize}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-rose-950/50 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isResizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang Xử Lý Nén Ảnh...</span>
              </>
            ) : (
              <>
                <Flame className="h-4 w-4" />
                <span>
                  Bắt Đầu Giảm Dung Lượng ({selectedImagePaths.size.toLocaleString()} ảnh)
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* CỘT PHẢI: BẢNG DANH SÁCH HÌNH ẢNH */}
      <main className="flex flex-1 flex-col overflow-hidden bg-slate-950 p-5">
        {imageItems.length === 0 ? (
          isInspecting ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-slate-900/60 p-8 text-center shadow-2xl backdrop-blur-sm">
              <Loader2 className="h-10 w-10 text-rose-400 animate-spin mb-4" />
              <h3 className="text-base font-semibold text-slate-100">Đang đọc thông số hình ảnh...</h3>
              <p className="mt-2 text-xs text-slate-400">Hệ thống đang quét siêu tốc kích thước các tệp ảnh trên ổ cứng</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/20 text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-950/40 text-rose-400 border border-rose-900/30">
                <ImageIcon className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-200">Chưa có tệp hình ảnh nào</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Hãy bấm "Quét Thư Mục" hoặc "Chọn Files" ở thanh trên để tìm các tệp ảnh (.jpg, .png, .webp, .bmp) cần giảm dung lượng.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onScanFolder}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-amber-900/30 transition cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Quét Thư Mục Chứa Ảnh
                </button>
                <button
                  type="button"
                  onClick={onSelectFiles}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-900/30 transition cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Chọn Tệp Ảnh Cụ Thể
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl backdrop-blur">
            {/* Top Toolbar: Tìm kiếm, lọc định dạng, chọn nhanh */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 p-3 text-xs">
              {/* Tìm kiếm */}
              <div className="relative w-72">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Lọc tên ảnh trong danh sách..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* Lọc định dạng */}
              <div className="flex items-center gap-1.5">
                {(['all', 'JPG', 'PNG', 'WEBP'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormatFilter(fmt)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      formatFilter === fmt
                        ? 'bg-rose-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {fmt === 'all' ? 'Tất cả' : fmt}
                  </button>
                ))}
              </div>

              {/* Chọn nhanh */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={onDeselectAll}
                  className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={onSelectOver2MB}
                  className="rounded bg-rose-950/60 border border-rose-800/40 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-900/60 transition cursor-pointer"
                  title="Chỉ chọn những ảnh có dung lượng trên 2 MB"
                >
                  &gt; 2MB
                </button>
                <button
                  type="button"
                  onClick={onSelectOver1920}
                  className="rounded bg-indigo-950/60 border border-indigo-800/40 px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-900/60 transition cursor-pointer"
                  title="Chỉ chọn những ảnh có độ phân giải lớn hơn 1920px"
                >
                  &gt; 1920px
                </button>
                <button
                  type="button"
                  onClick={onSelectOverTarget}
                  className="rounded bg-amber-950/60 border border-amber-800/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-900/60 transition cursor-pointer"
                  title="Chỉ chọn những ảnh thực sự lớn hơn kích thước mới đã cấu hình"
                >
                  ⚡ Chỉ ảnh &gt; mục tiêu
                </button>
              </div>

              {/* Thống kê */}
              <div className="flex items-center gap-3 text-slate-300 font-mono text-[11px]">
                <span>
                  Đã chọn: <strong className="text-rose-400">{selectedImagePaths.size}</strong> / {imageItems.length} ảnh
                </span>
                <span className="text-slate-500">|</span>
                <span>
                  Dung lượng: <strong className="text-slate-200">{formatBytes(selectedBytes)}</strong>
                </span>
              </div>
            </div>

            {/* Bảng Danh Sách */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={handleToggleSelectFiltered}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 font-semibold">Tên Tệp Hình Ảnh</th>
                    <th className="w-20 px-3 py-3 font-semibold text-center">Định Dạng</th>
                    <th className="w-32 px-3 py-3 font-semibold text-center">Kích Thước Gốc</th>
                    <th className="w-32 px-3 py-3 font-semibold text-center">Kích Thước Sau Nén</th>
                    <th className="w-24 px-3 py-3 font-semibold text-right">Dung Lượng</th>
                    <th className="w-36 px-3 py-3 font-semibold text-center">Trạng Thái</th>
                    <th className="w-12 px-2 py-3 text-center">Mở</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredImages.map((img) => {
                    const isSelected = selectedImagePaths.has(img.path);
                    const [newW, newH] = calculateNewDims(
                      img.width,
                      img.height,
                      resizeConfig.max_width,
                      resizeConfig.max_height,
                      resizeConfig.preserve_aspect_ratio
                    );
                    const isAlreadySmaller =
                      (resizeConfig.max_width > 0 || resizeConfig.max_height > 0) &&
                      (resizeConfig.max_width === 0 || img.width <= resizeConfig.max_width) &&
                      (resizeConfig.max_height === 0 || img.height <= resizeConfig.max_height);
                    const result = resizeResults[img.path];

                    return (
                      <tr
                        key={img.path}
                        className={`transition hover:bg-slate-800/40 cursor-pointer ${
                          isSelected ? 'bg-rose-950/15' : ''
                        }`}
                        onClick={() => onToggleSelect(img.path)}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(img.path)}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Tên tệp & đường dẫn */}
                        <td className="px-3 py-2.5 max-w-xs">
                          <div className="font-sans font-medium text-slate-100 truncate" title={img.file_name}>
                            {img.file_name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate" title={img.path}>
                            {img.path}
                          </div>
                        </td>

                        {/* Định dạng */}
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              img.format === 'PNG'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : img.format === 'WEBP'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {img.format}
                          </span>
                        </td>

                        {/* Kích thước gốc */}
                        <td className="px-3 py-2.5 text-center text-slate-300">
                          {img.width > 0 ? `${img.width} × ${img.height}` : 'Không rõ'}
                        </td>

                        {/* Kích thước mới */}
                        <td className="px-3 py-2.5 text-center">
                          {img.width > 0 ? (
                            isAlreadySmaller && resizeConfig.format_mode === 'original' ? (
                              <span className="text-slate-400">
                                {img.width} × {img.height}{' '}
                                <span className="text-[10px] text-amber-400 font-normal">
                                  (Đã nhỏ hơn)
                                </span>
                              </span>
                            ) : (
                              <span
                                className={
                                  newW !== img.width || newH !== img.height
                                    ? 'text-emerald-400 font-bold'
                                    : 'text-slate-400'
                                }
                              >
                                {newW} × {newH}
                              </span>
                            )
                          ) : (
                            '--'
                          )}
                        </td>

                        {/* Dung lượng file */}
                        <td className="px-3 py-2.5 text-right text-slate-300">
                          {formatBytes(img.file_size)}
                        </td>

                        {/* Trạng thái */}
                        <td className="px-3 py-2.5 text-center">
                          {result ? (
                            result.skipped ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30"
                                title={result.skip_reason}
                              >
                                🛡️ Giữ nguyên (bảo vệ dung lượng)
                              </span>
                            ) : result.success ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" />
                                {result.original_size > result.new_size ? (
                                  <>
                                    Giảm{' '}
                                    {Math.round(
                                      ((result.original_size - result.new_size) /
                                        result.original_size) *
                                        100
                                    )}
                                    %
                                  </>
                                ) : (
                                  'Đã ghi đè'
                                )}
                              </span>
                            ) : (
                              <span
                                className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30"
                                title={result.error_message}
                              >
                                Thất bại
                              </span>
                            )
                          ) : isAlreadySmaller && resizeConfig.format_mode === 'original' ? (
                            <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400/90 border border-amber-500/20">
                              Bỏ qua (đã nhỏ hơn mục tiêu)
                            </span>
                          ) : isSelected ? (
                            <span className="inline-block rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                              Sẵn sàng nén
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
                              Bỏ qua
                            </span>
                          )}
                        </td>

                        {/* Nút Explorer */}
                        <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onOpenFolder(img.path)}
                            title="Mở thư mục trong File Explorer"
                            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-300 transition"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
