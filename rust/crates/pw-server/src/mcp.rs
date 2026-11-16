//! The workspace MCP server (app/mcp.js) on stdio, so Claude CLI can manage the workspace:
//! `project-workspace-server mcp` (register: claude mcp add project-workspace --scope user -- "<exe>" mcp).
use pw_core::workspace::{self as w, Project, Workspace};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn s(d: &str) -> Value { json!({ "type": "string", "description": d }) }
fn schema(props: Value, req: &[&str]) -> Value { json!({ "type": "object", "properties": props, "required": req }) }
fn tools() -> Value {
    json!([
        { "name": "list_projects", "description": "List all projects with the features they use and item counts.", "inputSchema": schema(json!({}), &[]) },
        { "name": "get_project", "description": "Get a project: its project.yaml, folder path and features (with each feature's storage, layout, folder and fields).", "inputSchema": schema(json!({ "project": s("Project id (folder name)") }), &["project"]) },
        { "name": "create_project", "description": "Create a project. Pass a name and optionally the full project.yaml. Each key in project.yaml (other than name/description/icon/color/tags/status) is a feature defined in features/<key>.yaml.", "inputSchema": schema(json!({ "name": s("Project name"), "yaml": s("Optional full project.yaml") }), &["name"]) },
        { "name": "update_project_yaml", "description": "Replace a project's project.yaml (validated). Seed items listed under features are created; nothing is deleted.", "inputSchema": schema(json!({ "project": s(""), "yaml": s("") }), &["project", "yaml"]) },
        { "name": "list_features", "description": "List the feature definitions in features/ (what each feature stores and how it looks), and the allowed stores/layouts.", "inputSchema": schema(json!({}), &[]) },
        { "name": "save_feature", "description": "Create or replace features/<key>.yaml. Keys: name, icon, stores (markdown|images|files|records|diagram|chat), layout (markdown: pages|cards|list; records: table|list|cards|kanban|calendar|orgchart|map), fields (records), columns (kanban), date_field (calendar), parent_field (orgchart), search, for_claude (skills|mcp), permissions (chat: ask|auto|read-only).", "inputSchema": schema(json!({ "key": s("Feature key, e.g. devices"), "yaml": s("Feature YAML") }), &["key", "yaml"]) },
        { "name": "list_items", "description": "List the items of one feature in a project (pages, records, diagrams, chats, or folders/files for images and files).", "inputSchema": schema(json!({ "project": s(""), "feature": s("Feature key as used in project.yaml"), "folder": s("Optional sub folder for images/files") }), &["project", "feature"]) },
        { "name": "read_item", "description": "Read one item: Markdown text for pages and skills, YAML data for records, Mermaid text for diagrams.", "inputSchema": schema(json!({ "project": s(""), "feature": s(""), "id": s("Item id (file name without extension)") }), &["project", "feature", "id"]) },
        { "name": "create_item", "description": "Create a new item in a feature. For records pass `data` with the feature's fields; for pages/diagrams pass `content` (Markdown / Mermaid).", "inputSchema": schema(json!({ "project": s(""), "feature": s(""), "title": s(""), "content": s("Optional text content"), "data": { "type": "object", "description": "Optional record fields" } }), &["project", "feature", "title"]) },
        { "name": "write_item", "description": "Overwrite an existing item. Pages/diagrams: `content`. Records: `data` (object) or `content` (YAML text).", "inputSchema": schema(json!({ "project": s(""), "feature": s(""), "id": s(""), "content": s(""), "data": { "type": "object" } }), &["project", "feature", "id"]) },
        { "name": "backlinks", "description": "Which pages and records of a project link to one item (\"mentioned in\"). Links are [[Title]] or [[feature/id]] in Markdown, or record fields of type link.", "inputSchema": schema(json!({ "project": s(""), "feature": s(""), "id": s("") }), &["project", "feature", "id"]) },
        { "name": "search", "description": "Full-text search across all projects (or one).", "inputSchema": schema(json!({ "query": s(""), "project": s("Optional project id") }), &["query"]) },
    ])
}
fn summary(p: &Project) -> Value {
    json!({ "id": p.slug, "name": p.name, "path": p.dir.to_string_lossy(), "meta": p.meta, "yamlError": p.error,
        "features": p.features.iter().map(|f| match &f.def {
            None => json!({ "key": f.key, "missing": true, "note": format!("features/{}.yaml does not exist", f.feature) }),
            Some(d) => json!({ "key": f.key, "feature": f.feature, "name": d["name"], "stores": d["stores"], "layout": d["layout"], "folder": d["folder"],
                "fields": d["fields"].as_array().map(|a| a.iter().map(|x| format!("{}:{}", x["name"].as_str().unwrap_or(""), x["type"].as_str().unwrap_or(""))).collect::<Vec<_>>()),
                "columns": d["columns"], "for_claude": d["for_claude"] }),
        }).collect::<Vec<_>>() })
}
fn call(ws: &Workspace, name: &str, a: &Value) -> Result<Value, String> {
    let g = |k: &str| a[k].as_str().unwrap_or("").to_string();
    let e = |e: w::HttpError| e.message;
    Ok(match name {
        "list_projects" => json!(ws.list_projects().iter().map(|p| json!({ "id": p["slug"], "name": p["name"], "description": p["description"], "error": p["error"],
            "features": p["features"].as_array().map(|a| a.iter().map(|f| format!("{} ({})", f["key"].as_str().unwrap_or(""), if f["missing"] == true { "undefined".to_string() } else { f["count"].to_string() })).collect::<Vec<_>>()).unwrap_or_default() })).collect::<Vec<_>>()),
        "get_project" => { let p = ws.load_project(&g("project")).map_err(e)?; let mut v = summary(&p); v["yaml"] = json!(p.yaml); v }
        "create_project" => summary(&ws.create_project(&json!({ "name": a["name"], "yaml": a["yaml"] })).map_err(e)?),
        "update_project_yaml" => summary(&ws.save_project_yaml(&g("project"), &g("yaml")).map_err(e)?),
        "list_features" => json!({ "stores": w::STORES, "layouts": w::layouts(), "fieldTypes": w::FIELD_TYPES, "features": ws.list_features().iter().map(|f| json!({ "key": f["key"], "error": f["error"], "yaml": f["yaml"] })).collect::<Vec<_>>() }),
        "save_feature" => { let f = ws.save_feature(&g("key"), &g("yaml")).map_err(e)?; json!({ "key": f["key"], "def": f["def"] }) }
        "list_items" => ws.list_items(&g("project"), &g("feature"), &g("folder"), false).map_err(e)?,
        "read_item" => ws.read_item(&g("project"), &g("feature"), &g("id")).map_err(e)?,
        "create_item" => ws.create_item(&g("project"), &g("feature"), &json!({ "title": a["title"], "content": a["content"], "data": a["data"] })).map_err(e)?,
        "write_item" => { let r = ws.write_item(&g("project"), &g("feature"), &g("id"), a["content"].as_str(), a.get("data").filter(|d| d.is_object())).map_err(e)?; json!({ "ok": true, "file": r["file"] }) }
        "backlinks" => json!(ws.backlinks(&g("project"), &g("feature"), &g("id")).map_err(e)?),
        "search" => json!(ws.search(&g("query"), a["project"].as_str().filter(|p| !p.is_empty()))),
        _ => return Err(format!("Unknown tool: {name}")),
    })
}

pub fn main() {
    let ws = crate::workspace_from_env();
    ws.ensure();
    let out = |m: Value| { let mut o = std::io::stdout().lock(); let _ = writeln!(o, "{m}"); let _ = o.flush(); };
    let respond = |id: &Value, r: Result<Value, Value>| out(match r { Ok(v) => json!({ "jsonrpc": "2.0", "id": id, "result": v }), Err(e) => json!({ "jsonrpc": "2.0", "id": id, "error": e }) });
    let handle = |m: &Value| {
        let id = m.get("id").cloned().unwrap_or(Value::Null);
        let note = id.is_null();
        match m["method"].as_str().unwrap_or("") {
            "initialize" => respond(&id, Ok(json!({ "protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"), "capabilities": { "tools": {} },
                "serverInfo": { "name": "project-workspace", "version": crate::VERSION },
                "instructions": format!("File-based project workspace at {}. features/<key>.yaml defines what a feature is; projects/<id>/project.yaml lists which features a project uses; content is plain files in each feature's folder.", ws.root.display()) }))),
            "ping" => respond(&id, Ok(json!({}))),
            "tools/list" => respond(&id, Ok(json!({ "tools": tools() }))),
            "tools/call" => respond(&id, Ok(match call(&ws, m["params"]["name"].as_str().unwrap_or(""), &m["params"]["arguments"]) {
                Ok(v) => json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap() }] }),
                Err(e) => json!({ "content": [{ "type": "text", "text": format!("Error: {e}") }], "isError": true }),
            })),
            "resources/list" => respond(&id, Ok(json!({ "resources": [] }))),
            "prompts/list" => respond(&id, Ok(json!({ "prompts": [] }))),
            other => if !note { respond(&id, Err(json!({ "code": -32601, "message": format!("Method not found: {other}") }))) },
        }
    };
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim(); if line.is_empty() { continue; }
        match serde_json::from_str::<Value>(line) {
            Ok(Value::Array(a)) => a.iter().for_each(&handle),
            Ok(m) => handle(&m),
            Err(_) => respond(&Value::Null, Err(json!({ "code": -32700, "message": "Parse error" }))),
        }
    }
}
