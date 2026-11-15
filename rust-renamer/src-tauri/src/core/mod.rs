pub mod collision;
pub mod context;
pub mod engine;
pub mod image_resizer;
pub mod rule;
pub mod rules;
pub mod scanner;
pub mod transaction;

pub use collision::{CollisionResolver, CollisionStrategy};
pub use context::{FileContext, FileMetadata, TargetScope};
pub use engine::{RenameItem, RenameStatus, RenamerEngine};
pub use image_resizer::{
    inspect_images, is_supported_image, resize_images_batch_with_progress, BatchResizeSummary,
    ImageItem, ResizeConfig, ResizeProgressPayload, ResizeResultItem,
};
pub use rule::RenameRule;
pub use rules::{ChangeExtensionRule, SpaceAction, SpaceRule};
pub use scanner::scan_directory;
pub use transaction::{RenameOperation, RenameRecord, TransactionManager};
