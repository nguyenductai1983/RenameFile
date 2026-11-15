// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod commands;
pub mod core;
pub mod rules;

use commands::{
    apply_renaming, batch_resize_and_overwrite_images, cancel_scan, export_to_csv,
    inspect_image_files, open_folder_in_os, open_url_in_browser, preview_renaming,
    rollback_renaming, scan_selected_directory, select_files, select_folder, AppState,
};
use core::transaction::TransactionManager;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            transaction_manager: Mutex::new(TransactionManager::new()),
            cancel_scan: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            select_files,
            select_folder,
            scan_selected_directory,
            cancel_scan,
            preview_renaming,
            apply_renaming,
            rollback_renaming,
            export_to_csv,
            open_folder_in_os,
            open_url_in_browser,
            inspect_image_files,
            batch_resize_and_overwrite_images
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
