//! Project Workspace core: the data folder (features, projects, items) and YAML.
//! No network, no processes. See docs/MIGRATION-RUST.md.
#![forbid(unsafe_code)]
pub mod workspace;
pub mod yaml;
