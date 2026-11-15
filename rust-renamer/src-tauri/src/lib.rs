pub mod core;
pub mod rules;

// Re-export core types for ergonomic API usage
pub use core::collision::{CollisionResolver, CollisionStrategy};
pub use core::context::{FileContext, FileMetadata, TargetScope};
pub use core::engine::{RenameItem, RenameStatus, RenamerEngine};
pub use core::rule::RenameRule;
pub use core::rules::{ChangeExtensionRule, SpaceAction, SpaceRule};
pub use core::scanner::{scan_directory, scan_directory_with_progress};
pub use core::transaction::{RenameOperation, RenameRecord, TransactionManager};

// Re-export Group 1 rules
pub use rules::vietnamese_clean::{
    remove_vietnamese_diacritics, CleanWhitespaceRule, RemoveVietnameseDiacriticsRule,
    SanitizeFilenameRule, SlugSeparator, WebSafeSlugRule,
};
