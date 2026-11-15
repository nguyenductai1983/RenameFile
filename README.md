# 🇻🇳 Rename File Viet

[![GitHub Repository](https://img.shields.io/badge/GitHub-nguyenductai1983%2FRenameFile-blue?style=for-the-badge&logo=github)](https://github.com/nguyenductai1983/RenameFile)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://github.com/nguyenductai1983/RenameFile/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows)](https://github.com/nguyenductai1983/RenameFile)

> **Rename File Viet** là tiện ích mã nguồn mở nhỏ gọn, mạnh mẽ và an toàn giúp đổi tên hàng loạt tệp tin và thư mục (Batch File & Folder Renamer) cùng tính năng nén & giảm kích thước ảnh hàng loạt (Image Resizer) với tốc độ cao.
>
> 🌐 **Kho mã nguồn chính thức:** [https://github.com/nguyenductai1983/RenameFile](https://github.com/nguyenductai1983/RenameFile)

Dự án cung cấp **2 phiên bản độc lập (Dual-Engine)** cùng chia sẻ tư duy thiết kế và tính năng, cho phép bạn lựa chọn công nghệ phù hợp nhất:
1. **C# WPF Edition** (`csharp/`): Tối ưu sâu cho hệ sinh thái Windows, hỗ trợ Dark/Light theme theo Windows, kiến trúc trong suốt.
2. **Rust Tauri Edition** (`rust-renamer/`): Engine Rust siêu tốc, tiêu thụ ít tài nguyên RAM, giao diện Web hiện đại (React + Tailwind CSS).

---

## ✨ Tính Năng Nổi Bật

- 🔤 **Chuẩn Hóa Tiếng Việt Đỉnh Cao**:
  - Chuyển tiếng Việt có dấu sang không dấu chuẩn Unicode (`Tiếng Việt` → `Tieng Viet`).
  - Chuẩn hoá khoảng trắng thừa, xóa dấu cách vô tình ở đầu/cuối tên file (`_FB11 23258 .cdr` → `FB11 23258.cdr`).
  - Viết hoa đầu từ, viết HOA TOÀN BỘ, hoặc viết thường toàn bộ.
- 🛡️ **An Toàn Tuyệt Đối & Chống Xung Đột (Collision Safe)**:
  - Tự động phát hiện các tệp tin có nguy cơ trùng tên sau khi đổi, chủ động thêm hậu tố `_1`, `_2` an toàn.
  - Chức năng **Hoàn tác (Undo / Rollback)** giúp khôi phục tên cũ tức thì nếu thao tác nhầm.
- 📏 **Hỗ Trợ Windows Long Path (> 260 Ký Tự)**:
  - Tự động vượt giới hạn `MAX_PATH` cổ điển của Windows bằng cơ chế tiền tố UNC `\\?\`.
  - Tuỳ chọn tự động cắt ngắn tên file dài quá 250 ký tự nhưng vẫn bảo toàn trọn vẹn phần mở rộng (extension).
- 📂 **Quét & Phân Loại Thông Minh**:
  - Tách bạch rõ ràng chức năng quét qua bảng điều khiển riêng:
    - 📁 *Quét thư mục con (Recursive)*
    - 👁️ *Bao gồm file ẩn (Hidden Files)*
    - 🗂️ *Đổi tên cả Thư mục (Rename Directories)*
  - Màu sắc nút bấm phân biệt rõ: Nút Thư mục (Màu Cam) và Nút Tệp tin (Màu Chàm).
  - Nút mở thư mục trong File Explorer (`/select`) định vị chính xác vị trí tệp tin trên ổ đĩa.
- ⚡ **Hiệu Năng Xử Lý Hàng Trăm Nghìn Tệp**:
  - Quét nền không giật lag giao diện (Background Multi-threaded Scanning).
  - Cơ chế hiển thị phân trang thông minh (Virtualization / Chunk rendering) với hiệu ứng tải (Loading spinner).
- 🖼️ **Giảm Kích Thước & Nén Ảnh Hàng Loạt (Image Resizer & Compressor)**:
  - Tích hợp trực tiếp cho cả 2 engine **Rust** (`image` crate) và **C#** (WIC - Windows Imaging Component).
  - Đổi kích thước theo chuẩn định sẵn (FHD 1080p, 2K, HD 720p, Web, Custom) hoặc tự do tùy chỉnh.
  - Tùy chỉnh mức chất lượng nén (Quality 10% - 100%) và định dạng xuất (Giữ nguyên / JPEG / PNG / WebP).
  - 🛡️ **Bảo vệ 2 tầng chống phình ảnh & ghi đè an toàn**:
    1. *Bảo vệ độ phân giải:* Tự động bỏ qua các ảnh ban đầu đã nhỏ hơn hoặc bằng kích thước đích (tuyệt đối không upscale làm tăng kích thước).
    2. *Bảo vệ dung lượng:* Nếu dung lượng nén mới $\ge$ dung lượng gốc, tự động hủy ghi đè và giữ nguyên bản gốc tối ưu hơn.
  - Hộp thoại xác nhận an toàn bắt buộc người dùng kiểm tra và đồng ý trước khi thực hiện ghi đè trực tiếp lên ảnh gốc.
- 🌓 **Giao Diện Sáng / Tối (Light & Dark Mode)**:
  - Tự động nhận diện và đồng bộ theo cài đặt hệ thống của Windows (hoặc tuỳ chỉnh tự do).

---

## ⚖️ So Sánh Giữa Hai Phiên Bản (Dual-Engine)

| Tiêu Chí | 🦀 Rust Tauri Edition | 🔷 C# WPF Edition |
| :--- | :--- | :--- |
| **Thư mục mã nguồn** | `rust-renamer/` | `csharp/` |
| **Công nghệ** | Rust (Tauri v2) + React + Tailwind | C# (.NET 11) + WPF XAML |
| **Giao diện (UI)** | Web UI hiện đại, responsive | Giao diện Windows Native thuần túy |
| **Đồng bộ Theme Windows** | Tùy chọn Sáng / Tối trong app | Tự động đồng bộ theo Windows Theme |
| **Mức tiêu thụ RAM** | Cực thấp (~30MB - 60MB) | Thấp (~60MB - 110MB) |
| **Tốc độ quét 100k+ file** | Siêu nhanh (Đa luồng Rayon/Walkdir) | Siêu nhanh (Task Parallel / Enumerate) |
| **Kích thước file thực thi**| ~6.5 MB (Bản phát hành độc lập) | Nhỏ gọn, tích hợp sẵn trên máy có .NET |

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
RenameFile/
├── assets/                     # Tài nguyên chung (App icon, hình ảnh minh họa)
│   └── app-icon.png
├── csharp/                     # Phiên bản C# .NET 11 WPF (Đã làm phẳng, ngắn gọn)
│   ├── Core/                   # Business logic: Rule engine, UndoManager, SafeLongPath
│   ├── MainWindow.xaml         # Giao diện chính WPF
│   ├── MainWindow.xaml.cs      # Logic điều khiển giao diện & Windows Theme
│   ├── RenameFileViet.csproj   # File cấu hình dự án C#
│   ├── RenameFileViet.slnx     # Solution file mở trực tiếp bằng Visual Studio
│   └── README.md               # Hướng dẫn chi tiết cho C#
├── rust-renamer/               # Phiên bản Rust Tauri v2
│   ├── src/                    # Giao diện React 18 + TypeScript + Tailwind
│   │   ├── App.tsx             # Component chính
│   │   ├── types.ts            # Định nghĩa kiểu dữ liệu
│   │   └── index.css           # Styling
│   ├── src-tauri/              # Backend Rust
│   │   ├── src/                # commands.rs, scanner.rs, renamer.rs, rules.rs
│   │   ├── Cargo.toml          # Rust dependencies
│   │   └── tauri.conf.json     # Cấu hình cửa sổ Tauri
│   └── README.md               # Hướng dẫn chi tiết cho Rust
├── .gitignore                  # Cấu hình bỏ qua tệp tạm (.NET, Rust, Node)
├── LICENSE                     # Giấy phép nguồn mở MIT
├── package.json                # Tiện ích chạy nhanh các lệnh npm từ thư mục gốc
└── README.md                   # Tài liệu tổng quan dự án
```

---

## 🚀 Hướng Dẫn Tải & Biên Dịch Mã Nguồn

### 0. Lấy mã nguồn mới nhất từ GitHub
```bash
# Clone toàn bộ dự án về máy
git clone https://github.com/nguyenductai1983/RenameFile.git

# Di chuyển vào thư mục dự án
cd RenameFile

# Cập nhật code mới nhất từ GitHub (nếu đã clone trước đó)
git pull origin main
```

### 1. Biên dịch Phiên bản C# (.NET 11 WPF)
Yêu cầu: Đã cài đặt [.NET 11 SDK](https://dotnet.microsoft.com/).
```powershell
# Di chuyển vào thư mục csharp
cd csharp

# Chạy thử nghiệm
dotnet run

# Chạy bộ tự kiểm tra (Self-test)
dotnet run -- --test

# Xuất bản file chạy Release
dotnet publish -c Release -r win-x64 --self-contained false -o publish
```

### 2. Biên dịch Phiên bản Rust (Tauri v2)
Yêu cầu: Đã cài đặt [Rust](https://rustup.rs/) và [Node.js](https://nodejs.org/).
```bash
# Di chuyển vào thư mục rust
cd rust-renamer

# Cài đặt thư viện giao diện
npm install

# Chạy thử nghiệm chế độ phát triển
npm run tauri dev

# Đóng gói file chạy Release
npm run tauri build -- --no-bundle
```
File thực thi nằm tại: `rust-renamer/src-tauri/target/release/rename-file-viet.exe`.

---

## 🤝 Đóng Góp Phát Triển & Báo Lỗi (Issues)

Kho lưu trữ chính thức: **[https://github.com/nguyenductai1983/RenameFile](https://github.com/nguyenductai1983/RenameFile)**

Mọi đóng góp, báo lỗi ([Issues](https://github.com/nguyenductai1983/RenameFile/issues)) hoặc đề xuất tính năng mới ([Pull Requests](https://github.com/nguyenductai1983/RenameFile/pulls)) đều rất được hoan nghênh:
1. Fork dự án: `https://github.com/nguyenductai1983/RenameFile/fork`.
2. Tạo nhánh tính năng mới: `git checkout -b feature/tinh-nang-moi`.
3. Commit thay đổi: `git commit -m 'Thêm tính năng mới'`.
4. Push lên nhánh của bạn: `git push origin feature/tinh-nang-moi`.
5. Tạo Pull Request trên GitHub.

---

## 📄 Giấy Phép (License)

Dự án được phát hành dưới giấy phép mã nguồn mở **[MIT License](LICENSE)**. Bạn hoàn toàn tự do sử dụng, chỉnh sửa và phân phối cho mục đích cá nhân cũng như thương mại.
