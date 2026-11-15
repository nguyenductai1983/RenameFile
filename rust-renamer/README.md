# Rename File Viet - Rust Tauri Edition

> Kho mã nguồn GitHub: **[https://github.com/nguyenductai1983/RenameFile](https://github.com/nguyenductai1983/RenameFile)**
>
> Để lấy code mới nhất: `git clone https://github.com/nguyenductai1983/RenameFile.git`

Phiên bản Rename File Viet được phát triển bằng **Rust (Tauri v2)** và **React 18 + TypeScript + Tailwind CSS**. Phiên bản này đem lại sự cân bằng giữa hiệu năng cực đỉnh, mức chiếm dụng bộ nhớ (RAM) tối thiểu cùng giao diện web hiện đại, mượt mà.

---

## 🌟 Tính Năng Nổi Bật

- **Engine Rust Siêu Nhanh & Nhẹ:**
  - Xử lý quét thư mục và đổi tên hàng trăm nghìn tệp tin bằng Rust đa luồng song song với dung lượng bộ nhớ cực kỳ tiết kiệm.
  - Hỗ trợ đầy đủ đường dẫn dài Windows UNC (`\\?\`).
- **Giao diện hiện đại (Modern Web UI):**
  - Giao diện Tailwind CSS trực quan, hỗ trợ Dark / Light mode linh hoạt.
  - Phân màu trực quan: Nút chọn Thư mục (Màu Cam Hổ Phách / Amber) và Nút chọn Tệp tin (Màu Chàm / Indigo).
  - Bảng tuỳ chọn quét đặt riêng biệt ở thanh bên trái (`⚙️ PHẠM VI QUÉT & ĐỐI TƯỢNG`).
- **Xử lý xung đột & an toàn dữ liệu:**
  - Tự động phát hiện trùng tên và xử lý an toàn với hậu tố số thứ tự (`_1`, `_2`).
  - Hỗ trợ rollback / hoàn tác tác vụ đổi tên nhanh chóng.
  - Nút mở thư mục trong File Explorer (`/select`) định vị chính xác vị trí tệp tin trên ổ cứng.

---

## 🛠️ Yêu Cầu Môi Trường

1. **Rust:** Rust toolchain (cargo, rustc >= 1.77) và `MSVC C++ Build Tools`.
2. **Node.js:** Node.js v18+ và `npm` (hoặc `pnpm`).
3. **WebView2:** Có sẵn trên Windows 10/11.

---

## 🚀 Hướng Dẫn Cài Đặt & Phát Triển

### 1. Cài đặt các gói phụ thuộc (Dependencies)
Mở terminal tại thư mục `rust-renamer/`:
```bash
npm install
```

### 2. Chạy môi trường Dev (Hot-Reload)
```bash
npm run tauri dev
```

### 3. Đóng gói bản phát hành (Build Release)
```bash
npm run tauri build -- --no-bundle
```
File thực thi độc lập (Standalone executable) sẽ được tạo tại:
`rust-renamer/src-tauri/target/release/rename-file-viet.exe`
