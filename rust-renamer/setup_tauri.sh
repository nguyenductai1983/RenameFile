#!/usr/bin/env bash
set -e

echo "=== 1. Khởi tạo Tauri React TypeScript Frontend ==="
npm create tauri-app@latest -- --manager npm --template react-ts --yes

echo "=== 2. Di chuyển các module lõi Rust vào src-tauri/src/ ==="
mkdir -p src-tauri/src
cp -r src/core src-tauri/src/
cp -r src/rules src-tauri/src/

echo "=== 3. Cài đặt các gói phụ thuộc Frontend ==="
npm install

echo "=== Hoàn tất khởi tạo cấu trúc Tauri Desktop ==="
