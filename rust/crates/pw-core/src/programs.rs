//! Programs the Claude CLI can work with in a project's chat through their MCP server (plans BLENDER, UNITY, UNREAL,
//! GODOT, OPENSCAD, FREECAD). Switched on per project with `programs:` in project.yaml (a project setting, not a feature);
//! results are kept in the project folder named after the program (`blender/`, …).
use serde_json::{json, Value};

pub struct Program {
    /// the name in `programs:` and the project folder for its results
    pub key: &'static str,
    pub name: &'static str,
    /// what to keep in the folder (the note for Claude)
    pub keep: &'static str,
    /// the MCP server entry for `--mcp-config`
    pub server: fn() -> Value,
}

pub const PROGRAMS: [Program; 6] = [
    Program { key: "blender", name: "Blender", keep: "the .blend files and exports",
        server: || json!({ "type": "stdio", "command": "uvx", "args": ["blender-mcp"] }) },
    Program { key: "unity", name: "Unity", keep: "the Unity project",
        server: || json!({ "type": "http", "url": "http://localhost:8080/mcp" }) },
    Program { key: "unreal", name: "Unreal", keep: "the Unreal project",
        server: || json!({ "type": "http", "url": "http://127.0.0.1:8000/mcp" }) },
    Program { key: "godot", name: "Godot", keep: "the Godot project",
        server: || json!({ "type": "stdio", "command": "uvx", "args": ["godot-ai", "attach"] }) },
    Program { key: "openscad", name: "OpenSCAD", keep: "the .scad models and STL files",
        server: || json!({ "type": "stdio", "command": "uvx", "args": ["openscad-mcp"] }) },
    Program { key: "freecad", name: "FreeCAD", keep: "the FreeCAD files (.FCStd) and exports",
        server: || json!({ "type": "stdio", "command": "freecad-mcp", "args": [], "env": { "FREECAD_MODE": "xmlrpc" } }) },
];

pub fn find(key: &str) -> Option<&'static Program> { PROGRAMS.iter().find(|p| p.key == key) }

/// The names listed in a project's `programs:` (a list, or one name), lower-case, in order, without repeats.
pub fn listed(meta: &serde_json::Map<String, Value>) -> Vec<String> {
    let raw: Vec<String> = match meta.get("programs") {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(|s| s.trim().to_lowercase())).collect(),
        Some(Value::String(s)) => s.split(',').map(|x| x.trim().to_lowercase()).collect(),
        _ => vec![],
    };
    let mut out: Vec<String> = vec![];
    for r in raw { if !r.is_empty() && !out.contains(&r) { out.push(r); } }
    out
}

/// The list for the screens: key, name and whether it is on in this project.
pub fn for_project(meta: &serde_json::Map<String, Value>) -> Value {
    let on = listed(meta);
    Value::Array(PROGRAMS.iter().map(|p| json!({ "key": p.key, "name": p.name, "on": on.iter().any(|x| x == p.key) })).collect())
}
