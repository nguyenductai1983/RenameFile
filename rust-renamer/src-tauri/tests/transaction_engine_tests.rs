use rename_file_viet::core::context::TargetScope;
use rename_file_viet::core::engine::{RenameItem, RenameStatus, RenamerEngine};
use rename_file_viet::core::rule::RenameRule;
use rename_file_viet::core::transaction::TransactionManager;
use rename_file_viet::rules::vietnamese_clean::RemoveVietnameseDiacriticsRule;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_collision_detection_in_batch() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    // 2 file khác nhau ban đầu nhưng đều được quy tắc biến đổi thành cùng 1 tên: "document.pdf"
    let file1 = base_path.join("doc_a.txt");
    let file2 = base_path.join("doc_b.txt");
    fs::write(&file1, "content a").expect("Write file1");
    fs::write(&file2, "content b").expect("Write file2");

    let mut items = vec![
        RenameItem {
            original_path: file1.clone(),
            original_name: "doc_a.txt".to_string(),
            new_name: "document.pdf".to_string(),
            target_path: base_path.join("document.pdf"),
            status: RenameStatus::Pending,
            has_collision: false,
        },
        RenameItem {
            original_path: file2.clone(),
            original_name: "doc_b.txt".to_string(),
            new_name: "document.pdf".to_string(),
            target_path: base_path.join("document.pdf"),
            status: RenameStatus::Pending,
            has_collision: false,
        },
    ];

    TransactionManager::resolve_collisions(&mut items).expect("Resolve collisions should succeed");

    assert_eq!(items[0].new_name, "document.pdf");
    assert_eq!(items[0].has_collision, false);

    // File thứ 2 bị trùng nên tự động thêm hậu tố _1 và trạng thái CollisionResolved
    assert_eq!(items[1].new_name, "document_1.pdf");
    assert_eq!(items[1].has_collision, true);
    assert_eq!(items[1].status, RenameStatus::CollisionResolved);
    assert_eq!(items[1].target_path, base_path.join("document_1.pdf"));
}

#[test]
fn test_collision_with_existing_disk_file() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    // Đã tồn tại sẵn file "output.txt" trên đĩa
    let existing_file = base_path.join("output.txt");
    fs::write(&existing_file, "existing file").expect("Write existing");

    // File cần đổi tên
    let source_file = base_path.join("source.txt");
    fs::write(&source_file, "source file").expect("Write source");

    let mut items = vec![RenameItem {
        original_path: source_file.clone(),
        original_name: "source.txt".to_string(),
        new_name: "output.txt".to_string(),
        target_path: base_path.join("output.txt"),
        status: RenameStatus::Pending,
        has_collision: false,
    }];

    TransactionManager::resolve_collisions(&mut items).expect("Resolve collisions should succeed");

    // Do "output.txt" đã có trên đĩa, tự động đổi thành "output_1.txt"
    assert_eq!(items[0].new_name, "output_1.txt");
    assert_eq!(items[0].has_collision, true);
    assert_eq!(items[0].status, RenameStatus::CollisionResolved);
    assert_eq!(items[0].target_path, base_path.join("output_1.txt"));
}

#[test]
fn test_transaction_commit_and_rollback() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    let f1 = base_path.join("f1.txt");
    let f2 = base_path.join("f2.txt");
    fs::write(&f1, "hello 1").expect("write f1");
    fs::write(&f2, "hello 2").expect("write f2");

    let mut manager = TransactionManager::new();

    let target1 = base_path.join("f1_renamed.txt");
    let target2 = base_path.join("f2_renamed.txt");

    let mut items = vec![
        RenameItem {
            original_path: f1.clone(),
            original_name: "f1.txt".to_string(),
            new_name: "f1_renamed.txt".to_string(),
            target_path: target1.clone(),
            status: RenameStatus::Pending,
            has_collision: false,
        },
        RenameItem {
            original_path: f2.clone(),
            original_name: "f2.txt".to_string(),
            new_name: "f2_renamed.txt".to_string(),
            target_path: target2.clone(),
            status: RenameStatus::Pending,
            has_collision: false,
        },
    ];

    // Commit đổi tên
    manager.commit(&mut items).expect("Commit should succeed");

    assert!(!f1.exists());
    assert!(!f2.exists());
    assert!(target1.exists());
    assert!(target2.exists());
    assert_eq!(manager.len(), 2);

    // Rollback lại trạng thái ban đầu
    let reverted = manager.rollback().expect("Rollback should succeed");
    assert_eq!(reverted.len(), 2);
    assert!(f1.exists());
    assert!(f2.exists());
    assert!(!target1.exists());
    assert!(!target2.exists());
    assert_eq!(manager.len(), 0);
}

#[test]
fn test_automatic_rollback_on_failure() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    let f1 = base_path.join("valid.txt");
    fs::write(&f1, "content 1").expect("write f1");

    // File 2 cố tình không tạo trên đĩa để kích hoạt lỗi
    let f2 = base_path.join("non_existent.txt");

    let target1 = base_path.join("valid_renamed.txt");
    let target2 = base_path.join("non_existent_renamed.txt");

    let mut manager = TransactionManager::new();
    let mut items = vec![
        RenameItem {
            original_path: f1.clone(),
            original_name: "valid.txt".to_string(),
            new_name: "valid_renamed.txt".to_string(),
            target_path: target1.clone(),
            status: RenameStatus::Pending,
            has_collision: false,
        },
        RenameItem {
            original_path: f2.clone(),
            original_name: "non_existent.txt".to_string(),
            new_name: "non_existent_renamed.txt".to_string(),
            target_path: target2.clone(),
            status: RenameStatus::Pending,
            has_collision: false,
        },
    ];

    // Commit sẽ thất bại ở item 2 và tự động rollback item 1 về vị trí cũ
    let result = manager.commit(&mut items);
    assert!(result.is_err());

    // File 1 ban đầu phải được phục hồi nguyên vẹn
    assert!(f1.exists(), "Original file 1 must be restored after automatic rollback");
    assert!(!target1.exists(), "Target file 1 must not exist after automatic rollback");
    assert_eq!(manager.len(), 0);
}

#[test]
fn test_engine_with_boxed_pipeline_and_rayon() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    let rule1: Box<dyn RenameRule> = Box::new(RemoveVietnameseDiacriticsRule {
        scope: TargetScope::StemOnly,
    });

    let pipeline = vec![rule1];
    let engine = RenamerEngine::with_pipeline(pipeline);

    // Tạo danh sách 100 đường dẫn giả lập xử lý đa luồng
    let mut file_paths = Vec::with_capacity(100);
    for i in 0..100 {
        let file_name = format!("Hồ Sơ Tiếng Việt Đợt {}.pdf", i);
        let path = base_path.join(file_name);
        file_paths.push(path);
    }

    // Rayon parallel preview
    let preview_items = engine.generate_preview(&file_paths).expect("Parallel preview failed");

    assert_eq!(preview_items.len(), 100);
    assert_eq!(preview_items[0].new_name, "Ho So Tieng Viet Dot 0.pdf");
    assert_eq!(preview_items[99].new_name, "Ho So Tieng Viet Dot 99.pdf");
}

#[test]
fn test_case_insensitive_filesystem_rename() {
    let dir = tempdir().expect("Failed to create tempdir");
    let base_path = dir.path();

    let file = base_path.join("readme.txt");
    fs::write(&file, "case test").expect("write file");

    let mut manager = TransactionManager::new();
    let target = base_path.join("README.TXT");

    let mut items = vec![RenameItem {
        original_path: file.clone(),
        original_name: "readme.txt".to_string(),
        new_name: "README.TXT".to_string(),
        target_path: target.clone(),
        status: RenameStatus::Pending,
        has_collision: false,
    }];

    // Collision detection không được nhận nhầm chính file này là conflict
    TransactionManager::resolve_collisions(&mut items).expect("Resolve collisions");
    assert_eq!(items[0].new_name, "README.TXT");
    assert_eq!(items[0].has_collision, false);

    // Commit đổi case an toàn
    manager.commit(&mut items).expect("Commit case change");
    assert_eq!(items[0].status, RenameStatus::Renamed);

    // Rollback lại
    manager.rollback().expect("Rollback case change");
    assert!(file.exists());
}
