# Rename File Viet - C# WPF Edition

> Kho mã nguồn GitHub: **[https://github.com/nguyenductai1983/RenameFile](https://github.com/nguyenductai1983/RenameFile)**
>
> Để lấy code mới nhất: `git clone https://github.com/nguyenductai1983/RenameFile.git`

Phiên bản Rename File Viet được phát triển bằng **C# (.NET 11)** và **WPF (Windows Presentation Foundation)**. Đây là phiên bản tối ưu sâu cho hệ điều hành Windows, có khả năng tích hợp tự động với giao diện Sáng / Tối (Light / Dark Theme) của Windows và xử lý hàng trăm nghìn tệp tin với hiệu năng cao.

---

## 🌟 Tính Năng Nổi Bật

- **Tích hợp sâu Windows:**
  - Hỗ trợ đổi theme tự động theo cài đặt hệ thống Windows (Light / Dark).
  - Tích hợp phím tắt mở thư mục trực tiếp trong File Explorer (`/select`).
- **Xử lý siêu tốc với Long Path (> 260 ký tự):**
  - Tự động bổ sung tiền tố `\\?\` khi xử lý đường dẫn dài tránh lỗi giới hạn MAX_PATH của Windows API cũ.
- **Quy tắc đổi tên đa dạng:**
  - Chuyển tiếng Việt có dấu sang không dấu chuẩn unicode.
  - Chuẩn hoá khoảng trắng, viết hoa chữ cái đầu, viết thường, viết HOA.
  - Cắt ngắn tên file quá dài (> 250 ký tự) mà vẫn giữ nguyên phần mở rộng (extension).
  - Tìm kiếm & thay thế, thêm tiền tố/hậu tố, xoá ký tự đặc biệt.
  - Tự động phát hiện xung đột và thêm hậu tố `_1`, `_2` an toàn tuyệt đối.
- **Giảm dung lượng & kích thước ảnh hàng loạt (Image Resizer):**
  - Tích hợp động cơ WIC (Windows Imaging Component) tăng tốc phần cứng, nén và resize ảnh cực nhanh.
  - Hỗ trợ đầy đủ các preset (FHD, 2K, HD, Web) hoặc tùy chỉnh, thanh trượt chất lượng (10% - 100%), định dạng gốc / JPEG / PNG.
  - Bảo vệ 2 lớp: Tự động bỏ qua ảnh nhỏ hơn kích thước đích (tránh upscale), hủy ghi đè nếu dung lượng sau nén lớn hơn bản gốc.
  - Hộp thoại cảnh báo ghi đè an toàn bắt buộc xác nhận trước khi thực hiện.
- **Giao diện thân thiện:**
  - Bảng tuỳ chọn quét đặt riêng biệt ở thanh bên trái (`⚙️ PHẠM VI QUÉT & ĐỐI TƯỢNG`).
  - Phân trang hiển thị thông minh với loading spinner mượt mà.

---

## 🛠️ Yêu Cầu Hệ Thống & Cài Đặt

1. **Hệ điều hành:** Windows 10 / Windows 11 (64-bit).
2. **Runtime / SDK:** [.NET 11 SDK](https://dotnet.microsoft.com/) (hoặc bản runtime tương thích).
3. **IDE đề xuất:** Visual Studio 2022+ hoặc JetBrains Rider / VS Code với C# Dev Kit.

---

## 🚀 Hướng Dẫn Biên Dịch & Chạy

### 1. Chạy ở chế độ Debug / Development
Mở PowerShell tại thư mục `csharp/`:
```powershell
dotnet run
```

### 2. Chạy bộ kiểm thử tự động (Self-Test Suite)
```powershell
dotnet run -- --test
```

### 3. Biên dịch bản phát hành (Release)
```powershell
dotnet publish -c Release -r win-x64 --self-contained false -o publish
```

File thực thi sẽ nằm tại: `csharp/publish/RenameFileViet.exe`.
