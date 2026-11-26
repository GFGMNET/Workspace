//! Project Workspace core: the data folder (features, projects, items) and YAML.
//! No network; the only process it starts is VS Code for "Open in VS Code". See docs/MIGRATION-RUST.md.
#![forbid(unsafe_code)]
pub mod builtin;
pub mod files;
pub mod items;
pub mod lenient;
pub mod links;
pub mod programs;
pub mod projects;
pub mod secrets;
pub mod workspace;
pub mod yaml;
