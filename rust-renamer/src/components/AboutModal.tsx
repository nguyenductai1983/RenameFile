import React from 'react';
import { X, Sparkles, Github, Bug, Download, Heart } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke('open_url_in_browser', { url });
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div 
        className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút Đóng */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          title="Đóng hộp thoại"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header: Logo, Tên, Phiên bản */}
        <div className="flex items-center gap-3.5 mb-5">
          <img
            src="/icon.png"
            alt="Rename File Viet Logo"
            className="h-12 w-12 rounded-xl shadow-lg shadow-indigo-500/20 object-cover border border-indigo-500/30"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Rename File Viet</h2>
              <span className="rounded-full bg-indigo-950 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 border border-indigo-700/60 font-mono">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tiện ích đổi tên tệp tiếng Việt &amp; nén ảnh hàng loạt (Rust Tauri v2)
            </p>
          </div>
        </div>

        {/* Thông tin phần mềm */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 mb-4 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Tác giả (Developer):</span>
            <span className="font-semibold text-slate-200">Nguyễn Đức Tài (nguyenductai1983)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Bản quyền / Giấy phép:</span>
            <span className="font-semibold text-emerald-400">MIT License (Mã nguồn mở miễn phí)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Nền tảng công nghệ:</span>
            <span className="font-mono text-slate-300">Rust 2021 • Tauri v2 • React 18 TypeScript</span>
          </div>
        </div>

        {/* Khung Tải Cập Nhật Nổi Bật */}
        <div className="rounded-xl border border-sky-500/40 bg-gradient-to-b from-sky-950/40 to-slate-950/80 p-4 mb-5">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider mb-1.5">
            <Sparkles className="h-4 w-4" />
            <span>Tải Bản Cập Nhật &amp; Xem Mã Nguồn</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-3.5">
            Dự án được cập nhật và phát hành phiên bản mới liên tục trên GitHub. Hãy bấm vào các nút bên dưới để tải bản cài đặt mới nhất hoặc gửi góp ý:
          </p>

          {/* Nút to: Tải bản cập nhật mới nhất (Releases) */}
          <button
            onClick={() => handleOpenUrl('https://github.com/nguyenductai1983/RenameFile/releases')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-500 hover:to-indigo-500 active:scale-98 cursor-pointer mb-2.5"
          >
            <Download className="h-4 w-4" />
            <span>🚀 Tải Bản Cập Nhật Mới Nhất (GitHub Releases)</span>
          </button>

          {/* Hai nút phụ: Repo & Issues */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleOpenUrl('https://github.com/nguyenductai1983/RenameFile')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <Github className="h-3.5 w-3.5 text-indigo-400" />
              <span>⭐ Xem Mã Nguồn</span>
            </button>
            <button
              onClick={() => handleOpenUrl('https://github.com/nguyenductai1983/RenameFile/issues')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            >
              <Bug className="h-3.5 w-3.5 text-amber-400" />
              <span>🐞 Báo Lỗi / Góp Ý</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            Được phát triển với <Heart className="h-3 w-3 text-rose-500 fill-rose-500 inline" /> cho cộng đồng Việt Nam
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
