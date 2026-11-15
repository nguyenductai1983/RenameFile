import React, { useState } from 'react';
import { AlertOctagon, Flame, Loader2 } from 'lucide-react';

export interface ResizeConfig {
  max_width: number;
  max_height: number;
  preserve_aspect_ratio: boolean;
  quality: number;
  format_mode: 'original' | 'webp' | 'jpeg' | 'png';
}

interface ConfirmOverwriteModalProps {
  isOpen: boolean;
  selectedCount: number;
  config: ResizeConfig;
  onConfirm: () => void;
  onCancel: () => void;
  isResizing: boolean;
}

export const ConfirmOverwriteModal: React.FC<ConfirmOverwriteModalProps> = ({
  isOpen,
  selectedCount,
  config,
  onConfirm,
  onCancel,
  isResizing,
}) => {
  const [understood, setUnderstood] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-rose-600/80 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-center gap-3 text-rose-500">
          <div className="rounded-xl bg-rose-500/15 p-2.5 border border-rose-500/30">
            <AlertOctagon className="h-7 w-7 text-rose-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Xác Nhận Giảm Kích Thước &amp; Ghi Đè</h3>
            <p className="text-xs text-rose-300 font-medium">Thao tác này sẽ thay đổi dữ liệu ảnh vĩnh viễn</p>
          </div>
        </div>

        {/* Tóm tắt thông số */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-2 text-slate-300">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Số lượng ảnh sẽ xử lý:</span>
            <strong className="text-rose-400 font-mono text-sm">{selectedCount.toLocaleString()} tệp ảnh</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Kích thước tối đa áp dụng:</span>
            <strong className="text-slate-200 font-mono">
              {config.max_width > 0 || config.max_height > 0
                ? `${config.max_width} × ${config.max_height} px`
                : 'Giữ nguyên phân giải'}
            </strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Chất lượng nén:</span>
            <strong className="text-slate-200 font-mono">{config.quality}%</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Định dạng xuất:</span>
            <strong className="text-slate-200 uppercase font-mono">{config.format_mode}</strong>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Chế độ ghi tệp:</span>
            <span className="inline-flex items-center gap-1 font-bold text-rose-400 uppercase tracking-wide">
              ⚠️ Ghi đè trực tiếp (Overwrite)
            </span>
          </div>
        </div>

        {/* Cảnh báo đỏ nổi bật */}
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3.5 text-xs text-rose-200 leading-relaxed space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-rose-400">
            <span>LƯU Ý QUAN TRỌNG:</span>
          </div>
          <p>
            Vì hình ảnh đã giảm kích thước và nén dung lượng sẽ <strong>KHÔNG THỂ PHỤC HỒI LẠI ĐƯỢC ĐỘ PHÂN GIẢI BAN ĐẦU</strong>. Toàn bộ các tệp gốc trên ổ cứng sẽ bị thay thế vĩnh viễn bằng phiên bản đã tối ưu.
          </p>
        </div>

        {/* Checkbox bắt buộc */}
        <label className="flex items-start gap-3 rounded-xl border border-rose-900/40 bg-slate-950/60 p-3.5 cursor-pointer hover:bg-slate-950 transition">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-rose-500 bg-slate-900 text-rose-600 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-200 select-none">
            Tôi đã kiểm tra kỹ danh sách và đồng ý ghi đè trực tiếp lên {selectedCount} tệp ảnh gốc.
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setUnderstood(false);
              onCancel();
            }}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            disabled={!understood || isResizing}
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isResizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Flame className="h-4 w-4" />
                <span>Ghi Đè &amp; Giảm Kích Thước</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
